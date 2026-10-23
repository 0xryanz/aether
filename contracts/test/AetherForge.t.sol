// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AetherToken} from "../src/AetherToken.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {RelicNFT} from "../src/RelicNFT.sol";
import {LoomNFT} from "../src/LoomNFT.sol";
import {Forge} from "../src/Forge.sol";
import {AetherMarket} from "../src/AetherMarket.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract AetherForgeTest is Test {
    MockUSDT internal usdt;
    AetherToken internal aether;
    AgentRegistry internal registry;
    RelicNFT internal relic;
    LoomNFT internal loom;
    Forge internal forge;
    AetherMarket internal market;

    address internal liquidity = makeAddr("liquidity");
    address internal treasury = makeAddr("treasury");
    address internal team = makeAddr("team");
    address internal ecosystem = makeAddr("ecosystem");
    address internal feeRecipient = makeAddr("feeRecipient");

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant ALICE_ID = keccak256("agent.alice.ai");
    bytes32 internal constant BOB_ID = keccak256("agent.bob.ai");
    bytes32 internal constant CAROL_ID = keccak256("agent.carol.ai");

    uint64 internal start;
    uint256 internal constant RATE_ONE = 1 ether; // per second
    uint256 internal constant RATE_TWO = 0.5 ether;

    function setUp() public {
        vm.warp(1_700_000_000);

        usdt = new MockUSDT();
        aether = new AetherToken(liquidity, team, ecosystem, treasury, address(this));
        registry = new AgentRegistry(address(this));
        relic = new RelicNFT(address(usdt), 18, address(registry), liquidity, treasury, address(this));
        loom = new LoomNFT(address(this));
        forge = new Forge(aether, relic, loom, registry, address(this));
        market = new AetherMarket(address(usdt), feeRecipient, address(this));

        relic.setForge(address(forge));
        loom.setForge(address(forge));
        aether.setMiningEngine(address(forge));

        market.setCollection(address(relic), true);
        market.setCollection(address(loom), true);

        registry.register(alice, ALICE_ID);
        registry.register(bob, BOB_ID);
        registry.register(carol, CAROL_ID);

        relic.setSaleActive(true);
        relic.setBnbPriceUsd(500 ether);

        // Alice, Bob and Carol get USDT and unlimited approvals.
        address[3] memory users = [alice, bob, carol];
        for (uint256 i = 0; i < users.length; ++i) {
            usdt.mint(users[i], 1_000 ether);
            vm.prank(users[i]);
            usdt.approve(address(relic), type(uint256).max);
            vm.prank(users[i]);
            usdt.approve(address(market), type(uint256).max);
        }

        start = uint64(block.timestamp + 1 days);
        uint64[] memory durations = new uint64[](2);
        durations[0] = 10 days;
        durations[1] = 10 days;
        uint256[] memory rates = new uint256[](2);
        rates[0] = RATE_ONE;
        rates[1] = RATE_TWO;
        forge.configureSchedule(start, durations, rates);
    }

    // ---------------------------------------------------------------------
    // Relic minting
    // ---------------------------------------------------------------------

    function testMintPriceLadderAndFundSplit() public {
        vm.startPrank(alice);
        uint256 liqBefore = usdt.balanceOf(liquidity);
        uint256 treasuryBefore = usdt.balanceOf(treasury);

        relic.mintWithUSDT(1);
        assertEq(usdt.balanceOf(liquidity) - liqBefore, 0.8 ether);
        assertEq(usdt.balanceOf(treasury) - treasuryBefore, 0.2 ether);

        relic.mintWithUSDT(3);
        // 1 + 4.5*3 = 14.5 USDT
        assertEq(usdt.balanceOf(liquidity) - liqBefore, 11.6 ether);
        assertEq(usdt.balanceOf(treasury) - treasuryBefore, 2.9 ether);
        vm.stopPrank();

        assertEq(relic.balanceOf(alice), 4);
        assertEq(relic.publicMinted(), 4);
        assertEq(relic.mintedByAgent(ALICE_ID), 4);
        assertEq(relic.nextTokenId(), 5);
    }

    function testAgentCapEnforced() public {
        vm.startPrank(alice);
        relic.mintWithUSDT(4);
        vm.expectRevert(RelicNFT.AgentCapReached.selector);
        relic.mintWithUSDT(1);
        vm.stopPrank();
    }

    function testMintRequiresAgentId() public {
        address stranger = makeAddr("stranger");
        usdt.mint(stranger, 100 ether);
        vm.startPrank(stranger);
        usdt.approve(address(relic), type(uint256).max);
        vm.expectRevert(RelicNFT.AgentNotVerified.selector);
        relic.mintWithUSDT(1);
        vm.stopPrank();
    }

    function testMintWithBNBRefundsExcessAndSplits() public {
        vm.deal(alice, 1 ether);
        uint256 cost = relic.quoteNative(ALICE_ID, 1);
        assertEq(cost, 0.002 ether); // 1 USD / 500 USD per BNB

        uint256 liqBefore = liquidity.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(alice);
        relic.mintWithBNB{value: 0.01 ether}(1);

        assertEq(liquidity.balance - liqBefore, 0.0016 ether);
        assertEq(treasury.balance - treasuryBefore, 0.0004 ether);
        assertEq(alice.balance, 1 ether - cost);
        assertEq(relic.balanceOf(alice), 1);
    }

    function testCannotMintWhenSaleInactive() public {
        relic.setSaleActive(false);
        vm.prank(alice);
        vm.expectRevert(RelicNFT.SaleNotActive.selector);
        relic.mintWithUSDT(1);
    }

    // ---------------------------------------------------------------------
    // Forge
    // ---------------------------------------------------------------------

    function testForgeBurnsTenRelicsAndMintsLoom() public {
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomId = forge.forge(ids);
        vm.stopPrank();

        assertEq(relic.balanceOf(alice), 0);
        assertEq(loom.balanceOf(alice), 1);
        assertEq(loom.ownerOf(loomId), alice);
        assertEq(loom.forgeTime(loomId), block.timestamp);
        assertEq(forge.totalWeight(), loom.WEIGHT_BOOST_TIER_ONE());
    }

    function testForgeRequiresTenUniqueRelics() public {
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);

        uint256[] memory nine = new uint256[](9);
        for (uint256 i = 0; i < 9; ++i) nine[i] = ids[i];
        vm.expectRevert(Forge.InvalidRelicCount.selector);
        forge.forge(nine);

        uint256[] memory dupe = new uint256[](10);
        for (uint256 i = 0; i < 10; ++i) dupe[i] = ids[0];
        vm.expectRevert(Forge.DuplicateRelic.selector);
        forge.forge(dupe);
        vm.stopPrank();
    }

    function testForgeRequiresApproval() public {
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.prank(alice);
        vm.expectRevert(RelicNFT.NotTokenOwnerOrApproved.selector);
        forge.forge(ids);
    }

    // ---------------------------------------------------------------------
    // Mining
    // ---------------------------------------------------------------------

    function testSingleLoomReceivesAllEmissions() public {
        vm.warp(start);
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomId = forge.forge(ids);
        vm.stopPrank();

        vm.warp(start + 5 days);
        uint256 claimable = forge.pending(loomId);
        assertApproxEqAbs(claimable, RATE_ONE * 5 days, 1e6);

        vm.warp(start + 12 days);
        claimable = forge.pending(loomId);
        // 10 days at RATE_ONE, 2 days at RATE_TWO.
        uint256 expected = RATE_ONE * 10 days + RATE_TWO * 2 days;
        assertApproxEqAbs(claimable, expected, 1e6);

        uint256[] memory looms = new uint256[](1);
        looms[0] = loomId;
        vm.prank(alice);
        uint256 claimed = forge.claim(looms);
        assertApproxEqAbs(claimed, expected, 1e6);
        assertEq(aether.balanceOf(alice), claimed);
    }

    /// @dev Two Looms forged at different times, exactly integrating the boost
    ///      curve: A has 27.5 weight-days, B has 22.5 over the 20 day window.
    function testBoostCurveSplitsRewardsByWeightTime() public {
        vm.warp(start);
        uint256[] memory aliceRelics = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomA = forge.forge(aliceRelics);
        vm.stopPrank();

        vm.warp(start + 5 days);
        uint256[] memory bobRelics = _giveRelics(bob, 10);
        vm.startPrank(bob);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomB = forge.forge(bobRelics);
        vm.stopPrank();

        vm.warp(start + 20 days);

        uint256[] memory aLooms = new uint256[](1);
        aLooms[0] = loomA;
        uint256[] memory bLooms = new uint256[](1);
        bLooms[0] = loomB;

        vm.prank(alice);
        uint256 aClaimed = forge.claim(aLooms);
        vm.prank(bob);
        uint256 bClaimed = forge.claim(bLooms);

        // 0-5d: A alone (2x). 5-10d: A 1.5x vs B 2x. 10-15d: A 1x vs B 1.5x.
        // 15-20d: both 1x. Stage two halves the rate at day 10.
        uint256 totalEmission = RATE_ONE * 10 days + RATE_TWO * 10 days;
        uint256 aExpected = RATE_ONE * 5 days + (RATE_ONE * 5 days * 3) / 7 + (RATE_TWO * 5 days * 2) / 5
            + RATE_TWO * 5 days / 2;
        uint256 bExpected = (RATE_ONE * 5 days * 4) / 7 + (RATE_TWO * 5 days * 3) / 5 + RATE_TWO * 5 days / 2;
        assertApproxEqAbs(aClaimed, aExpected, 1e9);
        assertApproxEqAbs(bClaimed, bExpected, 1e9);
        assertApproxEqAbs(aClaimed + bClaimed, totalEmission, 1e9);
    }

    function testClaimTransfersWeightToNewOwner() public {
        vm.warp(start);
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomId = forge.forge(ids);
        vm.stopPrank();

        vm.warp(start + 3 days);
        vm.prank(alice);
        loom.transferFrom(alice, bob, loomId);

        vm.warp(start + 6 days);
        uint256[] memory looms = new uint256[](1);
        looms[0] = loomId;
        vm.prank(bob);
        uint256 claimed = forge.claim(looms);
        assertApproxEqAbs(claimed, RATE_ONE * 6 days, 1e6);
        assertEq(aether.balanceOf(bob), claimed);
    }

    function testCannotClaimSomeoneElsesLoom() public {
        vm.warp(start);
        uint256[] memory ids = _giveRelics(alice, 10);
        vm.startPrank(alice);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomId = forge.forge(ids);
        vm.stopPrank();

        vm.warp(start + 2 days);
        uint256[] memory looms = new uint256[](1);
        looms[0] = loomId;
        vm.prank(bob);
        vm.expectRevert(Forge.NotLoomOwner.selector);
        forge.claim(looms);
    }

    function testEmissionCappedByScheduleAndBudget() public {
        // Reconfigure is blocked.
        uint64[] memory d = new uint64[](1);
        d[0] = 1 days;
        uint256[] memory r = new uint256[](1);
        r[0] = 1 ether;
        vm.expectRevert(Forge.ScheduleAlreadySet.selector);
        forge.configureSchedule(start, d, r);

        // An over-budget schedule is rejected on a fresh engine.
        Forge fresh = new Forge(aether, relic, loom, registry, address(this));
        uint256[] memory rates = new uint256[](2);
        rates[0] = 30_000_000 ether; // per second -> way above the 45% cap over a day
        rates[1] = 0;
        uint64[] memory durations = new uint64[](2);
        durations[0] = 1 days;
        durations[1] = 1 days;
        vm.expectRevert(Forge.EmissionBudgetExceeded.selector);
        fresh.configureSchedule(start, durations, rates);
    }

    // ---------------------------------------------------------------------
    // Invites
    // ---------------------------------------------------------------------

    function testReferralEarnsEightPercentAndFreeRelic() public {
        vm.prank(bob);
        forge.bindReferrer(alice);

        // Bob mints one Relic -> invite becomes valid -> Alice gets a free Relic.
        vm.prank(bob);
        relic.mintWithUSDT(1);
        assertTrue(forge.inviteValid(bob));
        assertEq(forge.validInvites(alice), 1);
        assertEq(relic.balanceOf(alice), 1);

        vm.warp(start);
        uint256[] memory ids = _giveRelics(bob, 10);
        vm.startPrank(bob);
        relic.setApprovalForAll(address(forge), true);
        uint256 loomId = forge.forge(ids);
        vm.stopPrank();

        vm.warp(start + 2 days);
        uint256[] memory looms = new uint256[](1);
        looms[0] = loomId;
        vm.prank(bob);
        uint256 bobClaim = forge.claim(looms);

        uint256 referral = (bobClaim * 800) / 10_000;
        assertEq(forge.referralClaimable(alice), referral);
        assertEq(forge.referralEarned(alice), referral);

        uint256 before = aether.balanceOf(alice);
        vm.prank(alice);
        uint256 paid = forge.claimReferral();
        assertEq(paid, referral);
        assertEq(aether.balanceOf(alice), before + referral);
        assertEq(forge.referralClaimable(alice), 0);
    }

    function testOnlyFirstThreeInvitesRewardARelic() public {
        // Alice has no activity yet; bind four invitees and activate them.
        for (uint256 i = 0; i < 4; ++i) {
            address invitee = address(uint160(0xB000 + i));
            bytes32 agentId = keccak256(abi.encode("invitee", i));
            registry.register(invitee, agentId);
            usdt.mint(invitee, 10 ether);
            vm.startPrank(invitee);
            usdt.approve(address(relic), type(uint256).max);
            forge.bindReferrer(alice);
            relic.mintWithUSDT(1);
            vm.stopPrank();
        }

        assertEq(forge.validInvites(alice), 4);
        // Only 3 free Relics, all from the team reserve.
        assertEq(relic.balanceOf(alice), 3);
        assertEq(relic.teamMinted(), 3);
        assertEq(relic.publicMinted(), 4);
    }

    function testInviteeCannotBeItsOwnReferrer() public {
        vm.prank(alice);
        vm.expectRevert(Forge.InvalidReferrer.selector);
        forge.bindReferrer(alice);
    }

    function testBindReferrerOnce() public {
        vm.prank(carol);
        forge.bindReferrer(alice);
        vm.prank(carol);
        vm.expectRevert(Forge.AlreadyBound.selector);
        forge.bindReferrer(bob);
    }

    // ---------------------------------------------------------------------
    // Market
    // ---------------------------------------------------------------------

    function testBuyOrderFillChargesOnePercentFee() public {
        uint256[] memory ids = _giveRelics(bob, 1);

        vm.prank(alice);
        uint256 orderId = market.createOrder(address(relic), ids[0], 100 ether);
        assertEq(usdt.balanceOf(address(market)), 100 ether);

        vm.startPrank(bob);
        relic.setApprovalForAll(address(market), true);
        uint256 sellerBefore = usdt.balanceOf(bob);
        market.fillOrder(orderId, ids[0]);
        vm.stopPrank();

        assertEq(usdt.balanceOf(bob) - sellerBefore, 99 ether);
        assertEq(usdt.balanceOf(feeRecipient), 1 ether);
        assertEq(relic.ownerOf(ids[0]), alice);
        (,,,,, bool active) = _order(orderId);
        assertFalse(active);
    }

    function testCancelOrderRefundsBuyer() public {
        uint256 before = usdt.balanceOf(alice);
        vm.startPrank(alice);
        uint256 orderId = market.createOrder(address(loom), 0, 50 ether);
        vm.stopPrank();

        assertEq(usdt.balanceOf(alice), before - 50 ether);

        vm.prank(alice);
        market.cancelOrder(orderId);
        assertEq(usdt.balanceOf(alice), before);
    }

    function testCannotFillWithWrongTokenId() public {
        uint256[] memory ids = _giveRelics(bob, 2);
        vm.prank(alice);
        uint256 orderId = market.createOrder(address(relic), ids[1], 10 ether);

        vm.startPrank(bob);
        relic.setApprovalForAll(address(market), true);
        vm.expectRevert(AetherMarket.TokenMismatch.selector);
        market.fillOrder(orderId, ids[0]);
        vm.stopPrank();
    }

    function testOrderNeedsAllowedCollection() public {
        vm.prank(alice);
        vm.expectRevert(AetherMarket.CollectionNotAllowed.selector);
        market.createOrder(address(aether), 0, 10 ether);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _order(uint256 orderId) internal view returns (address, address, uint256, uint256, uint64, bool) {
        AetherMarket.Order memory o = market.orderAt(orderId);
        return (o.buyer, o.collection, o.tokenId, o.price, o.createdAt, o.active);
    }

    /// @dev Register throwaway agents, mint one 1-USDT Relic each and forward it
    ///      to `to`. Used to assemble 10 Relics without relying on the 4-per-agent cap.
    function _giveRelics(address to, uint256 count) internal returns (uint256[] memory tokenIds) {
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            address minter = address(uint160(0x100_000 + tokenIds.length * 1000 + i));
            while (registry.isVerified(minter)) {
                minter = address(uint160(uint256(keccak256(abi.encode(minter)))));
            }
            registry.register(minter, keccak256(abi.encode("minter", minter)));
            usdt.mint(minter, 10 ether);
            vm.startPrank(minter);
            usdt.approve(address(relic), type(uint256).max);
            relic.mintWithUSDT(1);
            uint256 tokenId = relic.nextTokenId() - 1;
            relic.transferFrom(minter, to, tokenId);
            vm.stopPrank();
            tokenIds[i] = tokenId;
        }
    }
}
