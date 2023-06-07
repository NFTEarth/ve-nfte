import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { FeeDistributor, SurplusBeneficiary, TestERC20, VeNFTE } from "../../typechain"
import { getLatestTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("SurplusBeneficiary test", () => {
    const [admin, alice] = waffle.provider.getWallets()
    let veNFTE: VeNFTE
    let feeDistributor: FeeDistributor
    let surplusBeneficiary: SurplusBeneficiary
    let testNFTE: TestERC20
    let testUSDC: TestERC20
    let treasury: TestERC20
    const daoPercentage = 0.42e6 // 42%
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365

    beforeEach(async () => {
        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        testNFTE = await testERC20Factory.deploy()
        await testNFTE.__TestERC20_init("NFTE", "NFTE", 18)

        testUSDC = await testERC20Factory.deploy()
        await testUSDC.__TestERC20_init("USDC", "USDC", 6)

        // use erc20 contract as a treasury contract
        treasury = await testERC20Factory.deploy()

        const veNFTEFactory = await ethers.getContractFactory("veNFTE")
        veNFTE = (await veNFTEFactory.deploy(testNFTE.address, "veNFTE", "veNFTE", "v1")) as VeNFTE

        const feeDistributorFactory = await ethers.getContractFactory("FeeDistributor")
        feeDistributor = (await feeDistributorFactory.deploy(
            veNFTE.address,
            await getLatestTimestamp(),
            testUSDC.address,
            admin.address,
            admin.address,
        )) as FeeDistributor

        const surplusBeneficiaryFactory = await ethers.getContractFactory("SurplusBeneficiary")
        surplusBeneficiary = (await surplusBeneficiaryFactory.deploy(
            testUSDC.address,
            feeDistributor.address,
            treasury.address,
            daoPercentage,
        )) as SurplusBeneficiary
    })

    describe("# dispatch", () => {
        it("emit Dispatch event and check balance when dispatch", async () => {
            const tokenAmount = parseUnits("100", 6)
            const tokenAmountToTreasury = tokenAmount.mul(daoPercentage).div(1e6)
            const tokenAmountToFeeDistributor = tokenAmount.sub(tokenAmountToTreasury)

            await testUSDC.mint(surplusBeneficiary.address, tokenAmount)

            await expect(surplusBeneficiary.dispatch())
                .to.be.emit(surplusBeneficiary, "Dispatch")
                .withArgs(tokenAmountToTreasury, tokenAmountToFeeDistributor)

            const balanceOfTreasury = await testUSDC.balanceOf(treasury.address)
            const balanceOfFeeDistributor = await testUSDC.balanceOf(feeDistributor.address)

            expect(balanceOfTreasury).to.be.eq(tokenAmountToTreasury)
            expect(balanceOfFeeDistributor).to.be.eq(tokenAmountToFeeDistributor)
        })
    })
})
