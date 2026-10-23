// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AetherToken} from "./AetherToken.sol";
import {RelicNFT} from "./RelicNFT.sol";
import {LoomNFT} from "./LoomNFT.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IActivityHook} from "./interfaces/IActivityHook.sol";

/// @title Forge
/// @notice Mining engine of Aether Forge.
///
/// Looms are forged by burning 10 Relics. Mining weight follows the current
/// holder and is time-dependent: 2x for the first 5 days after forging, 1.5x
/// for days 6-10, 1x afterwards. Rewards accrue passively and can be claimed at
/// any time.
///
/// Accounting is a checkpointed "reward per weight" accumulator. Every weight
/// change (a new Loom, a boost expiring) is processed exactly at its timestamp
/// using a min-heap of expiry events, so claims are exact even when users have
/// not interacted for weeks.
contract Forge is Ownable2Step, ReentrancyGuard, IActivityHook {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_REFERRAL_SHARE_BPS = 1_000; // 10% hard cap
    uint256 public constant FREE_INVITE_REWARDS = 3;

    AetherToken public immutable aether;
    RelicNFT public immutable relic;
    LoomNFT public immutable loom;
    IAgentRegistry public immutable registry;

    struct Stage {
        uint64 end;
        uint256 ratePerSecond;
    }

    /// @notice Emission stages, each with an absolute end time and a rate.
    Stage[] public stages;
    uint64 public miningStart;
    uint64 public miningEnd;
    uint256 public scheduledEmission;
    uint256 public emittedFromSchedule;

    /// @notice Cumulative $AETHER per 1e18 weight (18 decimals).
    uint256 public accPerWeight;
    /// @notice Sum of effective weights of all Looms (18 decimals).
    uint256 public totalWeight;
    uint64 private _cursor;

    /// @notice Min-heap of timestamps at which boosts expire.
    uint64[] private _expiryHeap;
    /// @notice Aggregated weight reduction for a timestamp.
    mapping(uint64 => uint256) private _expiryDelta;

    struct Checkpoint {
        uint64 time;
        uint256 acc;
    }
    Checkpoint[] private _checkpoints;

    mapping(uint256 => uint64) public lastClaim;
    mapping(address => address) public referrerOf;
    mapping(address => bool) public inviteValid;
    mapping(address => uint256) public validInvites;
    mapping(address => uint256) public referralClaimable;
    mapping(address => uint256) public referralEarned;
    mapping(address => uint256) public minedBy;
    mapping(address => uint256) public totalReferralMinted;

    uint16 public referralShareBps = 800; // 8%
    bool public forgingActive = true;
    bool public claimingActive = true;

    event ScheduleConfigured(uint64 start, uint64 end, uint256 totalEmission, uint8 stageCount);
    event LoomForged(address indexed owner, uint256[] relicIds, uint256 indexed loomId, uint64 timestamp);
    event Claimed(address indexed user, uint256 amount, uint256 referralAmount);
    event ReferralClaimed(address indexed referrer, uint256 amount);
    event ReferrerBound(address indexed invitee, address indexed referrer);
    event InviteActivated(address indexed referrer, address indexed invitee, uint256 validCount);
    event InviteReward(address indexed referrer, address indexed invitee, uint256 relicId);
    event ReferralShareSet(uint16 bps);
    event ForgingActiveSet(bool active);
    event ClaimingActiveSet(bool active);

    error ForgingPaused();
    error ClaimingPaused();
    error NotLoomOwner();
    error DuplicateRelic();
    error InvalidRelicCount();
    error NoLoomIds();
    error InvalidReferrer();
    error AlreadyBound();
    error ScheduleAlreadySet();
    error InvalidSchedule();
    error EmissionBudgetExceeded();
    error InvalidShare();

    constructor(
        AetherToken aether_,
        RelicNFT relic_,
        LoomNFT loom_,
        IAgentRegistry registry_,
        address initialOwner
    ) Ownable(initialOwner) {
        require(
            address(aether_) != address(0) && address(relic_) != address(0) && address(loom_) != address(0)
                && address(registry_) != address(0),
            "zero address"
        );
        aether = aether_;
        relic = relic_;
        loom = loom_;
        registry = registry_;
    }

    // ---------------------------------------------------------------------
    // Emission schedule
    // ---------------------------------------------------------------------

    /// @notice Configure the staged emission schedule once, before mining starts.
    /// @param start Absolute unix timestamp at which mining starts.
    /// @param durations Duration of each stage in seconds.
    /// @param rates Emission rate per second, in $AETHER wei.
    function configureSchedule(
        uint64 start,
        uint64[] calldata durations,
        uint256[] calldata rates
    ) external onlyOwner {
        if (stages.length != 0) revert ScheduleAlreadySet();
        if (durations.length == 0 || durations.length != rates.length) revert InvalidSchedule();
        if (start < block.timestamp) revert InvalidSchedule();

        uint64 cursor = start;
        uint256 total;
        for (uint256 i = 0; i < durations.length; ++i) {
            if (durations[i] == 0) revert InvalidSchedule();
            cursor += durations[i];
            total += rates[i] * uint256(durations[i]);
            stages.push(Stage({end: cursor, ratePerSecond: rates[i]}));
            if (total > aether.MINING_SUPPLY()) revert EmissionBudgetExceeded();
        }

        // Keep at least 1/11 of the mining reserve for the referral bonus so the
        // 8% invite share can never push minting past the 45% cap.
        if ((total * (BPS + MAX_REFERRAL_SHARE_BPS)) / BPS > aether.MINING_SUPPLY()) {
            revert EmissionBudgetExceeded();
        }

        miningStart = start;
        miningEnd = cursor;
        scheduledEmission = total;
        emit ScheduleConfigured(start, cursor, total, uint8(durations.length));
    }

    // ---------------------------------------------------------------------
    // Forge
    // ---------------------------------------------------------------------

    /// @notice Burn 10 Relics and mint one Loom. Caller must be approved on all
    ///         Relics; Relics are burned one by one.
    function forge(uint256[] calldata relicIds) external nonReentrant returns (uint256 loomId) {
        if (!forgingActive) revert ForgingPaused();
        if (relicIds.length != 10) revert InvalidRelicCount();

        for (uint256 i = 0; i < 10; ++i) {
            for (uint256 j = i + 1; j < 10; ++j) {
                if (relicIds[i] == relicIds[j]) revert DuplicateRelic();
            }
        }

        _sync();

        for (uint256 i = 0; i < 10; ++i) {
            relic.burnForForge(relicIds[i]);
        }

        loomId = loom.mint(msg.sender);
        uint64 now_ = uint64(block.timestamp);
        lastClaim[loomId] = now_;

        // New Looms enter the pool at the maximum boost weight.
        uint256 tierOne = loom.WEIGHT_BOOST_TIER_ONE();
        uint256 tierTwo = loom.WEIGHT_BOOST_TIER_TWO();
        totalWeight += tierOne;
        _scheduleExpiry(now_ + loom.BOOST_TIER_ONE_DURATION(), tierOne - tierTwo);
        _scheduleExpiry(now_ + loom.BOOST_TIER_TWO_DURATION(), tierTwo - loom.WEIGHT_ONE());

        _pushCheckpoint(now_, accPerWeight);
        _markActive(msg.sender);

        emit LoomForged(msg.sender, relicIds, loomId, now_);
    }

    // ---------------------------------------------------------------------
    // Claiming
    // ---------------------------------------------------------------------

    /// @notice Claim accrued $AETHER for the given Looms owned by the caller.
    function claim(uint256[] calldata loomIds) external nonReentrant returns (uint256 total) {
        if (!claimingActive) revert ClaimingPaused();
        if (loomIds.length == 0) revert NoLoomIds();

        _sync();
        uint256 now_ = block.timestamp;

        for (uint256 i = 0; i < loomIds.length; ++i) {
            uint256 loomId = loomIds[i];
            if (loom.ownerOf(loomId) != msg.sender) revert NotLoomOwner();
            uint64 start = lastClaim[loomId];
            if (start == 0) start = loom.forgeTime(loomId);
            total += _pending(loomId, start, uint64(now_), false);
            lastClaim[loomId] = uint64(now_);
        }

        if (total == 0) {
            emit Claimed(msg.sender, 0, 0);
            return 0;
        }

        _markActive(msg.sender);

        aether.mintMining(msg.sender, total);
        minedBy[msg.sender] += total;

        uint256 referralAmount;
        address referrer = referrerOf[msg.sender];
        if (referrer != address(0) && inviteValid[msg.sender] && referralShareBps != 0) {
            referralAmount = (total * referralShareBps) / BPS;
            if (referralAmount != 0) {
                referralClaimable[referrer] += referralAmount;
                referralEarned[referrer] += referralAmount;
            }
        }

        emit Claimed(msg.sender, total, referralAmount);
    }

    /// @notice Claim referral earnings separately from mining rewards.
    function claimReferral() external nonReentrant returns (uint256 amount) {
        amount = referralClaimable[msg.sender];
        if (amount == 0) return 0;
        referralClaimable[msg.sender] = 0;
        totalReferralMinted[msg.sender] += amount;
        aether.mintMining(msg.sender, amount);
        emit ReferralClaimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Invites
    // ---------------------------------------------------------------------

    /// @notice Bind the caller to a referrer. One-time, cannot be changed.
    function bindReferrer(address referrer) external nonReentrant {
        if (referrer == address(0) || referrer == msg.sender || !registry.isVerified(referrer)) {
            revert InvalidReferrer();
        }
        if (referrerOf[msg.sender] != address(0)) revert AlreadyBound();
        referrerOf[msg.sender] = referrer;
        emit ReferrerBound(msg.sender, referrer);
        _markActive(msg.sender);
    }

    /// @notice Called by the Relic collection after mints; also callable by anyone
    ///         to activate an invite that qualified retroactively.
    function onActivity(address account) external override nonReentrant {
        _markActive(account);
    }

    function syncActivity(address account) external nonReentrant {
        _markActive(account);
    }

    function _markActive(address account) internal {
        if (inviteValid[account]) return;
        address referrer = referrerOf[account];
        if (referrer == address(0)) return;

        bytes32 agentId = registry.agentIdOf(account);
        bool active = (agentId != bytes32(0) && relic.mintedByAgent(agentId) > 0) || loom.balanceOf(account) > 0;
        if (!active) return;

        inviteValid[account] = true;
        uint256 count = ++validInvites[referrer];
        emit InviteActivated(referrer, account, count);

        if (count <= FREE_INVITE_REWARDS && relic.teamRemaining() > 0) {
            try relic.mintTeam(referrer) returns (uint256 tokenId) {
                emit InviteReward(referrer, account, tokenId);
            } catch {}
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Accrued but unclaimed $AETHER for a Loom (view projection).
    function pending(uint256 loomId) external view returns (uint256) {
        uint64 forged = loom.forgeTime(loomId);
        if (forged == 0) return 0;
        uint64 start = lastClaim[loomId];
        if (start == 0) start = forged;
        return _pending(loomId, start, uint64(block.timestamp), true);
    }

    /// @notice Accrued but unclaimed $AETHER across all Looms of a wallet.
    function pendingForWallet(address account) external view returns (uint256 total) {
        uint256 count = loom.balanceOf(account);
        for (uint256 i = 0; i < count; ++i) {
            uint256 loomId = loom.tokenOfOwnerByIndex(account, i);
            uint64 start = lastClaim[loomId];
            if (start == 0) start = loom.forgeTime(loomId);
            total += _pending(loomId, start, uint64(block.timestamp), true);
        }
    }

    /// @notice Effective weight of a wallet at the current timestamp.
    function walletWeight(address account) external view returns (uint256 weight) {
        uint256 count = loom.balanceOf(account);
        for (uint256 i = 0; i < count; ++i) {
            weight += loom.weightAt(loom.tokenOfOwnerByIndex(account, i), block.timestamp);
        }
    }

    function stats()
        external
        view
        returns (
            uint256 weight,
            uint256 acc,
            uint256 emitted,
            uint256 scheduled,
            uint64 start,
            uint64 end
        )
    {
        return (totalWeight, accPerWeight, emittedFromSchedule, scheduledEmission, miningStart, miningEnd);
    }

    function stageCount() external view returns (uint256) {
        return stages.length;
    }

    function rateAt(uint256 timestamp) external view returns (uint256) {
        return _rateAt(uint64(timestamp));
    }

    /// @notice Advance the accumulator to the current block. Anyone may call this;
    ///         it only settles time-based accounting and cannot move funds.
    function sync() external {
        _sync();
    }

    function checkpointCount() external view returns (uint256) {
        return _checkpoints.length;
    }

    function accAt(uint256 timestamp) external view returns (uint256) {
        return _accAtView(uint64(timestamp));
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setReferralShare(uint16 bps) external onlyOwner {
        if (bps > MAX_REFERRAL_SHARE_BPS) revert InvalidShare();
        referralShareBps = bps;
        emit ReferralShareSet(bps);
    }

    function setForgingActive(bool active) external onlyOwner {
        forgingActive = active;
        emit ForgingActiveSet(active);
    }

    function setClaimingActive(bool active) external onlyOwner {
        claimingActive = active;
        emit ClaimingActiveSet(active);
    }

    // ---------------------------------------------------------------------
    // Accounting internals
    // ---------------------------------------------------------------------

    function _pending(
        uint256 loomId,
        uint64 start,
        uint64 end,
        bool viewMode
    ) internal view returns (uint256 pendingAmount) {
        if (end <= start) return 0;

        uint64 forged = loom.forgeTime(loomId);
        uint64 tierOneEnd = forged + loom.BOOST_TIER_ONE_DURATION();
        uint64 tierTwoEnd = forged + loom.BOOST_TIER_TWO_DURATION();

        uint64 cursor = start;
        while (cursor < end) {
            uint64 segmentEnd = end;
            if (cursor < tierOneEnd && tierOneEnd < segmentEnd) segmentEnd = tierOneEnd;
            else if (cursor < tierTwoEnd && tierTwoEnd < segmentEnd) segmentEnd = tierTwoEnd;

            uint256 weight = loom.weightAt(loomId, cursor);
            uint256 accStart = viewMode ? _accAtView(cursor) : _accAt(cursor);
            uint256 accEnd = viewMode ? _accAtView(segmentEnd) : _accAt(segmentEnd);
            pendingAmount += (weight * (accEnd - accStart)) / 1 ether;
            cursor = segmentEnd;
        }
    }

    /// @dev Accumulator value at `timestamp` for settled history.
    function _accAt(uint64 timestamp) internal view returns (uint256) {
        if (timestamp >= _cursor) return accPerWeight;
        uint256 lo;
        uint256 hi = _checkpoints.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_checkpoints[mid].time <= timestamp) lo = mid + 1;
            else hi = mid;
        }
        if (lo == 0) return 0;
        return _checkpoints[lo - 1].acc;
    }

    /// @dev Same as `_accAt`, but projects emission from the last checkpoint to
    ///      `timestamp` without touching state, replaying pending boost expiries
    ///      from a memory copy of the heap. This keeps UI estimates exact.
    function _accAtView(uint64 timestamp) internal view returns (uint256) {
        if (timestamp <= _cursor) return _accAt(timestamp);
        if (totalWeight == 0 || miningStart == 0) return accPerWeight;

        uint64[] memory heap = _expiryHeap;
        uint256 heapLen = heap.length;
        uint256 weight = totalWeight;
        uint256 acc = accPerWeight;
        uint64 cursor = _cursor;

        while (cursor < timestamp) {
            uint64 next = timestamp;
            uint64 stageEnd = _nextStageEnd(cursor);
            if (stageEnd != 0 && stageEnd < next) next = stageEnd;
            if (heapLen != 0 && heap[0] < next) next = heap[0];

            if (next > cursor && weight != 0) {
                uint64 from = cursor > miningStart ? cursor : miningStart;
                uint64 to = next < miningEnd ? next : miningEnd;
                if (to > from) {
                    uint256 rate = _rateAt(from);
                    if (rate != 0) acc += (rate * uint256(to - from) * 1 ether) / weight;
                }
            }

            cursor = next;

            while (heapLen != 0 && heap[0] == cursor) {
                uint256 delta = _expiryDelta[cursor];
                weight = delta > weight ? 0 : weight - delta;
                heapLen = _heapPopMemory(heap, heapLen);
            }
        }

        return acc;
    }

    /// @dev Bring the accumulator forward to `block.timestamp`, settling every
    ///      boost expiry and stage boundary at its exact timestamp.
    function _sync() internal {
        uint64 now_ = uint64(block.timestamp);
        if (_cursor == 0) {
            _cursor = now_;
            _pushCheckpoint(now_, accPerWeight);
            return;
        }
        if (now_ <= _cursor) return;

        uint256 acc = accPerWeight;
        uint256 weight = totalWeight;
        uint64 cursor = _cursor;

        while (cursor < now_) {
            uint64 next = now_;
            uint64 stageEnd = _nextStageEnd(cursor);
            if (stageEnd != 0 && stageEnd < next) next = stageEnd;
            if (_expiryHeap.length != 0 && _expiryHeap[0] < next) next = _expiryHeap[0];

            if (next > cursor && weight != 0 && miningStart != 0) {
                uint64 from = cursor > miningStart ? cursor : miningStart;
                uint64 to = next < miningEnd ? next : miningEnd;
                if (to > from) {
                    uint256 rate = _rateAt(from);
                    if (rate != 0) {
                        acc += (rate * uint256(to - from) * 1 ether) / weight;
                        emittedFromSchedule += rate * uint256(to - from);
                    }
                }
            }

            cursor = next;

            while (_expiryHeap.length != 0 && _expiryHeap[0] == cursor) {
                uint256 delta = _expiryDelta[cursor];
                delete _expiryDelta[cursor];
                weight = delta > weight ? 0 : weight - delta;
                _heapPop();
            }

            _pushCheckpoint(cursor, acc);
        }

        accPerWeight = acc;
        totalWeight = weight;
        _cursor = now_;
    }

    function _scheduleExpiry(uint64 at, uint256 delta) internal {
        if (delta == 0) return;
        if (_expiryDelta[at] == 0) _heapPush(at);
        _expiryDelta[at] += delta;
    }

    function _pushCheckpoint(uint64 time, uint256 acc) internal {
        uint256 len = _checkpoints.length;
        if (len != 0 && _checkpoints[len - 1].time >= time) return;
        _checkpoints.push(Checkpoint({time: time, acc: acc}));
    }

    function _nextStageEnd(uint64 timestamp) internal view returns (uint64) {
        uint256 len = stages.length;
        for (uint256 i = 0; i < len; ++i) {
            if (stages[i].end > timestamp) return stages[i].end;
        }
        return 0;
    }

    function _rateAt(uint64 timestamp) internal view returns (uint256) {
        uint256 len = stages.length;
        for (uint256 i = 0; i < len; ++i) {
            if (timestamp < stages[i].end) return stages[i].ratePerSecond;
        }
        return 0;
    }

    // ---------------------------------------------------------------------
    // Min-heap of expiry timestamps
    // ---------------------------------------------------------------------

    function _heapPush(uint64 value) internal {
        _expiryHeap.push(value);
        uint256 index = _expiryHeap.length - 1;
        while (index > 0) {
            uint256 parent = (index - 1) / 2;
            if (_expiryHeap[parent] <= _expiryHeap[index]) break;
            (_expiryHeap[parent], _expiryHeap[index]) = (_expiryHeap[index], _expiryHeap[parent]);
            index = parent;
        }
    }

    function _heapPop() internal {
        uint256 len = _expiryHeap.length;
        if (len == 0) return;
        _expiryHeap[0] = _expiryHeap[len - 1];
        _expiryHeap.pop();

        uint256 index = 0;
        while (true) {
            uint256 left = index * 2 + 1;
            uint256 right = left + 1;
            uint256 smallest = index;
            if (left < _expiryHeap.length && _expiryHeap[left] < _expiryHeap[smallest]) smallest = left;
            if (right < _expiryHeap.length && _expiryHeap[right] < _expiryHeap[smallest]) smallest = right;
            if (smallest == index) break;
            (_expiryHeap[smallest], _expiryHeap[index]) = (_expiryHeap[index], _expiryHeap[smallest]);
            index = smallest;
        }
    }

    /// @dev Pop the root of a memory copy of the heap and return the new length.
    function _heapPopMemory(uint64[] memory heap, uint256 len) internal pure returns (uint256) {
        heap[0] = heap[len - 1];
        len -= 1;

        uint256 index = 0;
        while (true) {
            uint256 left = index * 2 + 1;
            uint256 right = left + 1;
            uint256 smallest = index;
            if (left < len && heap[left] < heap[smallest]) smallest = left;
            if (right < len && heap[right] < heap[smallest]) smallest = right;
            if (smallest == index) break;
            (heap[smallest], heap[index]) = (heap[index], heap[smallest]);
            index = smallest;
        }
        return len;
    }
}
