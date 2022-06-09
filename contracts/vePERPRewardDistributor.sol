// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { MerkleRedeemUpgradeSafe } from "./Balancer/MerkleRedeemUpgradeSafe.sol";
import { IvePERP } from "./interface/IvePERP.sol";

contract vePERPRewardDistributor is MerkleRedeemUpgradeSafe {
    /// @notice Emitted when vePERP address is changed.
    /// @param oldValue Old vePERP address
    /// @param newValue New vePERP address
    event VePERPChanged(address oldValue, address newValue);

    /// @notice Emitted when minimum lock time is changed.
    /// @param oldValue Old minimum lock time
    /// @param newValue New minimum lock time
    event MinLockTimeChanged(uint256 oldValue, uint256 newValue);

    uint256 internal constant _WEEK = 7 * 86400; // a week in seconds

    //**********************************************************//
    //    The below state variables can not change the order    //
    //**********************************************************//
    // array of week
    uint256[] public merkleRootIndexes;
    uint256 public minLockDuration;
    address public vePERP;
    //**********************************************************//
    //    The above state variables can not change the order    //
    //**********************************************************//

    //
    // MODIFIER
    //
    modifier userLockTimeCheck(address user) {
        uint256 currentEpochStartTimestamp = (block.timestamp / _WEEK) * _WEEK; // round down to the start of the epoch
        uint256 userLockEndTimestamp = IvePERP(vePERP).locked__end(user);

        require(userLockEndTimestamp >= currentEpochStartTimestamp + minLockDuration, "less than minLockDuration");
        _;
    }

    //
    // ONLY OWNER
    //

    function initialize(
        address _token,
        address _vePERP,
        uint256 _minLockTime
    ) external initializer {
        require(_token != address(0), "Invalid input");
        emit MinLockTimeChanged(minLockDuration, _minLockTime);
        minLockDuration = _minLockTime;
        emit VePERPChanged(vePERP, _vePERP);
        vePERP = _vePERP;
        __MerkleRedeem_init(_token);

        // approve the vePERP contract to spend the PERP token
        token.approve(vePERP, uint256(-1));
    }

    function seedAllocations(
        uint256 _week,
        bytes32 _merkleRoot,
        uint256 _totalAllocation
    ) public override onlyOwner {
        super.seedAllocations(_week, _merkleRoot, _totalAllocation);
        merkleRootIndexes.push(_week);
    }

    /// @dev In case of vePERP migration, unclaimed PERP would be able to be deposited to the new contract instead
    function setVePERP(address _vePERP) external onlyOwner {
        require(_vePERP != address(0), "Invalid input");
        emit VePERPChanged(vePERP, _vePERP);
        vePERP = _vePERP;
    }

    function setMinLockTime(uint256 _minLockTime) external onlyOwner {
        emit MinLockTimeChanged(minLockDuration, _minLockTime);
        minLockDuration = _minLockTime;
    }

    //
    // PUBLIC NON-VIEW
    //

    /// @dev Overwrite the parent's function because vePERP distributor doesn't follow the inherited behaviors
    ///      from its parent. More specifically, it uses deposit_for() instead of transfer() to distribute the rewards.
    function claimWeek(
        address _liquidityProvider,
        uint256 _week,
        uint256 _claimedBalance,
        bytes32[] calldata _merkleProof
    ) public override userLockTimeCheck(_liquidityProvider) {
        require(!claimed[_week][_liquidityProvider], "Claimed already");
        require(verifyClaim(_liquidityProvider, _week, _claimedBalance, _merkleProof), "Incorrect merkle proof");

        claimed[_week][_liquidityProvider] = true;
        distribute(_liquidityProvider, _claimedBalance);
    }

    /// @dev Overwrite the parent's function because vePERP distributor doesn't follow the inherited behaviors
    ///      from its parent. More specifically, it uses deposit_for() instead of transfer() to distribute the rewards.
    function claimWeeks(address _liquidityProvider, Claim[] calldata claims)
        public
        override
        userLockTimeCheck(_liquidityProvider)
    {
        uint256 totalBalance = 0;
        Claim calldata claim;
        for (uint256 i = 0; i < claims.length; i++) {
            claim = claims[i];

            require(!claimed[claim.week][_liquidityProvider], "Claimed already");
            require(
                verifyClaim(_liquidityProvider, claim.week, claim.balance, claim.merkleProof),
                "Incorrect merkle proof"
            );

            totalBalance += claim.balance;
            claimed[claim.week][_liquidityProvider] = true;
        }
        distribute(_liquidityProvider, totalBalance);
    }

    //
    // EXTERNAL VIEW
    //

    function getLengthOfMerkleRoots() external view returns (uint256) {
        return merkleRootIndexes.length;
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @dev Replace parent function disburse() because vePERP distributor uses deposit_for() instead of transfer()
    ///      to distribute the rewards
    function distribute(address _liquidityProvider, uint256 _balance) internal {
        if (_balance > 0) {
            emit Claimed(_liquidityProvider, _balance);
            IvePERP(vePERP).deposit_for(_liquidityProvider, _balance);
        }
    }
}
