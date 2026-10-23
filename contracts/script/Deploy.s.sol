// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {AetherToken} from "../src/AetherToken.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {RelicNFT} from "../src/RelicNFT.sol";
import {LoomNFT} from "../src/LoomNFT.sol";
import {Forge} from "../src/Forge.sol";
import {AetherMarket} from "../src/AetherMarket.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploys and wires the whole Aether Forge stack.
///
/// Environment (all optional except PRIVATE_KEY):
///   PRIVATE_KEY          deployer key
///   USDT_ADDRESS         existing USDT; a MockUSDT is deployed when empty
///   USDT_DECIMALS        defaults to 18 (BSC-USDT)
///   TREASURY             20% mint proceeds + market fees
///   LIQUIDITY            80% mint proceeds
///   TEAM_BENEFICIARY     team vesting wallet beneficiary
///   ECOSYSTEM            ecosystem allocation
///   OWNER                final multisig owner (2-step transfer when set)
///   BNB_PRICE_USD        default 600e18
///   MINING_START_DELAY   seconds from now, default 0
///   SALE_ACTIVE          default true
contract Deploy is Script {
    struct Params {
        address treasury;
        address liquidity;
        address teamBeneficiary;
        address ecosystem;
        address finalOwner;
        address usdt;
        uint8 usdtDecimals;
        uint256 bnbPriceUsd;
        uint256 startDelay;
        bool saleActive;
        bool selfRegistration;
    }

    struct Deployment {
        address usdt;
        address aether;
        address registry;
        address relic;
        address loom;
        address forge;
        address market;
        address teamVesting;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        Params memory params = _params(vm.addr(pk));

        vm.startBroadcast(pk);
        Deployment memory d = _deploy(params, vm.addr(pk));
        _configure(d, params);
        _handOver(d, params.finalOwner, vm.addr(pk));
        vm.stopBroadcast();

        _writeDeployment(d, params);
        _log(d);
    }

    function _params(address deployer) internal view returns (Params memory p) {
        p.treasury = vm.envOr("TREASURY", deployer);
        p.liquidity = vm.envOr("LIQUIDITY", deployer);
        p.teamBeneficiary = vm.envOr("TEAM_BENEFICIARY", deployer);
        p.ecosystem = vm.envOr("ECOSYSTEM", deployer);
        p.finalOwner = vm.envOr("OWNER", deployer);
        p.usdt = vm.envOr("USDT_ADDRESS", address(0));
        p.usdtDecimals = uint8(vm.envOr("USDT_DECIMALS", uint256(18)));
        p.bnbPriceUsd = vm.envOr("BNB_PRICE_USD", uint256(600 ether));
        p.startDelay = vm.envOr("MINING_START_DELAY", uint256(600));
        p.saleActive = vm.envOr("SALE_ACTIVE", true);
        p.selfRegistration = vm.envOr("ALLOW_SELF_REGISTRATION", false);
    }

    function _deploy(Params memory p, address deployer) internal returns (Deployment memory d) {
        d.usdt = p.usdt;
        if (d.usdt == address(0)) d.usdt = address(new MockUSDT());

        // Team allocation is locked for 12 months, then vests over 24 months.
        VestingWallet teamVesting =
            new VestingWallet(p.teamBeneficiary, uint64(block.timestamp + 365 days), uint64(730 days));
        d.teamVesting = address(teamVesting);

        d.aether = address(new AetherToken(p.liquidity, d.teamVesting, p.ecosystem, p.treasury, deployer));
        d.registry = address(new AgentRegistry(deployer));
        d.relic = address(
            new RelicNFT(d.usdt, p.usdtDecimals, d.registry, p.liquidity, p.treasury, deployer)
        );
        d.loom = address(new LoomNFT(deployer));
        d.forge = address(new Forge(AetherToken(d.aether), RelicNFT(d.relic), LoomNFT(d.loom), AgentRegistry(d.registry), deployer));
        d.market = address(new AetherMarket(d.usdt, p.treasury, deployer));
    }

    function _configure(Deployment memory d, Params memory p) internal {
        AetherToken(d.aether).setMiningEngine(d.forge);
        RelicNFT(d.relic).setForge(d.forge);
        LoomNFT(d.loom).setForge(d.forge);

        AetherMarket(d.market).setCollection(d.relic, true);
        AetherMarket(d.market).setCollection(d.loom, true);

        AgentRegistry(d.registry).setSelfRegistration(p.selfRegistration);
        RelicNFT(d.relic).setBnbPriceUsd(p.bnbPriceUsd);
        RelicNFT(d.relic).setSaleActive(p.saleActive);

        // 7 stages over 21 days, front-loaded. 401.76M AETHER scheduled, leaving
        // headroom inside the 45% mining cap for the 8% referral bonus.
        uint64[] memory durations = new uint64[](7);
        uint256[] memory rates = new uint256[](7);
        for (uint256 i = 0; i < 7; ++i) {
            durations[i] = 3 days;
        }
        rates[0] = 350 ether;
        rates[1] = 300 ether;
        rates[2] = 260 ether;
        rates[3] = 220 ether;
        rates[4] = 180 ether;
        rates[5] = 140 ether;
        rates[6] = 100 ether;
        Forge(d.forge).configureSchedule(uint64(block.timestamp + p.startDelay), durations, rates);
    }

    function _handOver(Deployment memory d, address finalOwner, address deployer) internal {
        if (finalOwner == deployer) return;
        AetherToken(d.aether).transferOwnership(finalOwner);
        AgentRegistry(d.registry).transferOwnership(finalOwner);
        RelicNFT(d.relic).transferOwnership(finalOwner);
        LoomNFT(d.loom).transferOwnership(finalOwner);
        Forge(d.forge).transferOwnership(finalOwner);
        AetherMarket(d.market).transferOwnership(finalOwner);
        VestingWallet(payable(d.teamVesting)).transferOwnership(finalOwner);
    }

    function _writeDeployment(Deployment memory d, Params memory p) internal {
        vm.createDir("deployments", true);
        string memory obj = "aether";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeUint(obj, "deployedAt", block.timestamp);
        vm.serializeUint(obj, "usdtDecimals", p.usdtDecimals);
        vm.serializeAddress(obj, "usdt", d.usdt);
        vm.serializeAddress(obj, "aether", d.aether);
        vm.serializeAddress(obj, "registry", d.registry);
        vm.serializeAddress(obj, "relic", d.relic);
        vm.serializeAddress(obj, "loom", d.loom);
        vm.serializeAddress(obj, "forge", d.forge);
        vm.serializeAddress(obj, "market", d.market);
        string memory json = vm.serializeAddress(obj, "teamVesting", d.teamVesting);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }

    function _log(Deployment memory d) internal pure {
        console2.log("AetherToken        ", d.aether);
        console2.log("AgentRegistry      ", d.registry);
        console2.log("RelicNFT           ", d.relic);
        console2.log("LoomNFT            ", d.loom);
        console2.log("Forge              ", d.forge);
        console2.log("AetherMarket       ", d.market);
        console2.log("USDT               ", d.usdt);
    }
}
