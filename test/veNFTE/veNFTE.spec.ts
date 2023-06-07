import { MockContract, smock } from "@defi-wonderland/smock"
import chai, { expect } from "chai"
import { solidity } from "ethereum-waffle"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestERC20, TestERC20__factory, VeNFTE } from "../../typechain"
import { getLatestBlock, getLatestTimestamp, getWeekTimestamp } from "../shared/utilities"

chai.use(solidity)

describe("veNFTE", () => {
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    let veNFTE: VeNFTE
    let testNFTE: TestERC20
    const DAY = 86400
    const WEEK = DAY * 7
    const MONTH = DAY * 30
    const YEAR = DAY * 365

    beforeEach(async () => {
        const testNFTEFactory = await ethers.getContractFactory("TestERC20")
        testNFTE = await testNFTEFactory.deploy()
        await testNFTE.__TestERC20_init("NFTE", "NFTE", 18)

        const veNFTEFactory = await ethers.getContractFactory("veNFTE")
        veNFTE = (await veNFTEFactory.deploy(testNFTE.address, "veNFTE", "veNFTE", "v1")) as VeNFTE

        await testNFTE.mint(alice.address, parseEther("1000"))
        await testNFTE.mint(bob.address, parseEther("1000"))
        await testNFTE.mint(carol.address, parseEther("1000"))

        await testNFTE.connect(alice).approve(veNFTE.address, parseEther("1000"))
        await testNFTE.connect(bob).approve(veNFTE.address, parseEther("1000"))
        await testNFTE.connect(carol).approve(veNFTE.address, parseEther("1000"))
    })

    async function checkNfteBalance(): Promise<void> {
        const currentEpoch = await veNFTE.epoch()
        const ptHistory = await veNFTE.point_history(currentEpoch)
        const totalNfte = await veNFTE.totalNFTESupply()
        // console.log(ptHistory.nfte_amt.toString(), " - ", totalNfte.toString())
        expect(totalNfte).to.be.eq(ptHistory.nfte_amt)
    }

    describe("create lock", async () => {
        it("create lock for 1 week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])

            const lockAmount = parseEther("100")

            const oldNfteBalanceAlice = await testNFTE.balanceOf(alice.address)
            const oldNfteBalanceVeNFTE = await testNFTE.balanceOf(veNFTE.address)

            const tx = await veNFTE.connect(alice).create_lock(lockAmount, nextWeekTimestamp + WEEK)
            await expect(tx)
                .to.emit(veNFTE, "Deposit")
                .withArgs(alice.address, lockAmount, nextWeekTimestamp + WEEK, 1, nextWeekTimestamp)
            await expect(tx).to.emit(veNFTE, "Supply").withArgs(0, lockAmount)

            expect(await testNFTE.balanceOf(alice.address)).to.be.eq(oldNfteBalanceAlice.sub(lockAmount))
            expect(await testNFTE.balanceOf(veNFTE.address)).to.be.eq(oldNfteBalanceVeNFTE.add(lockAmount))

            const balance = await veNFTE["balanceOf(address)"](alice.address)
            const weightedBalance = await veNFTE["balanceOfWeighted(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(WEEK))
            expect(weightedBalance).to.be.eq(lockAmount.div(YEAR).mul(WEEK).mul(3).add(lockAmount))

            expect(await veNFTE.totalNFTESupply()).to.be.eq(lockAmount)
            expect(await veNFTE["totalSupply()"]()).to.be.eq(balance)
            expect(await veNFTE["totalSupplyWeighted()"]()).to.be.eq(weightedBalance)
            expect(await veNFTE.supply()).to.be.eq(lockAmount)

            const locked = await veNFTE.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(nextWeekTimestamp + WEEK)

            await checkNfteBalance()
        })

        it("create lock for 1 year", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])

            const lockAmount = parseEther("100")
            const lockTime = 364 * DAY // 52 weeks

            const oldNfteBalanceAlice = await testNFTE.balanceOf(alice.address)
            const oldNfteBalanceVeNFTE = await testNFTE.balanceOf(veNFTE.address)

            const tx = await veNFTE.connect(alice).create_lock(lockAmount, nextWeekTimestamp + lockTime)
            await expect(tx)
                .to.emit(veNFTE, "Deposit")
                .withArgs(alice.address, lockAmount, nextWeekTimestamp + lockTime, 1, nextWeekTimestamp)
            await expect(tx).to.emit(veNFTE, "Supply").withArgs(0, lockAmount)

            expect(await testNFTE.balanceOf(alice.address)).to.be.eq(oldNfteBalanceAlice.sub(lockAmount))
            expect(await testNFTE.balanceOf(veNFTE.address)).to.be.eq(oldNfteBalanceVeNFTE.add(lockAmount))

            const blockNumber = await getLatestBlock()

            // balanceOf view functions
            const balance = await veNFTE["balanceOf(address)"](alice.address)
            const weightedBalance = await veNFTE["balanceOfWeighted(address)"](alice.address)
            expect(balance).to.be.eq(lockAmount.div(YEAR).mul(lockTime))
            expect(weightedBalance).to.be.eq(lockAmount.div(YEAR).mul(lockTime).mul(3).add(lockAmount))

            expect(await veNFTE["balanceOfAt(address,uint256)"](alice.address, blockNumber)).to.be.eq(balance)
            expect(await veNFTE["balanceOfAt(address,uint256,bool)"](alice.address, blockNumber, true)).to.be.eq(
                weightedBalance,
            )

            // total supply view functions
            expect(await veNFTE.totalNFTESupply()).to.be.eq(lockAmount)
            expect(await veNFTE["totalSupply()"]()).to.be.eq(balance)
            expect(await veNFTE["totalSupplyWeighted()"]()).to.be.eq(weightedBalance)
            expect(await veNFTE["totalSupplyAt(uint256)"](blockNumber)).to.be.eq(balance)
            expect(await veNFTE["totalSupplyAt(uint256,bool)"](blockNumber, true)).to.be.eq(weightedBalance)
            expect(await veNFTE.supply()).to.be.eq(lockAmount)

            const locked = await veNFTE.locked(alice.address)
            expect(locked.amount).to.be.eq(lockAmount)
            expect(locked.end).to.be.eq(nextWeekTimestamp + lockTime)

            await checkNfteBalance()
        })

        it("force error, old tokens not withdrawn", async () => {
            const timestamp = await getLatestTimestamp()

            await veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)

            await expect(veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)).to.be.revertedWith(
                "Withdraw old tokens first",
            )
        })

        it("force error, lock time not in the future", async () => {
            const timestamp = await getLatestTimestamp()
            await expect(veNFTE.connect(alice).create_lock(parseEther("100"), timestamp - WEEK)).to.be.revertedWith(
                "Can only lock until time in the future",
            )
        })

        it("force error, lock time exceeds 1 year", async () => {
            const timestamp = await getLatestTimestamp()
            await expect(veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + 2 * YEAR)).to.be.revertedWith(
                "Voting lock can be 1 year max",
            )
        })
    })

    describe("deposit for", async () => {
        beforeEach(async () => {
            // alice locks for 1 WEEK
            const lastTimestamp = await getLatestTimestamp()
            await veNFTE.connect(alice).create_lock(parseEther("100"), lastTimestamp + WEEK)
        })

        it("force error, value is zero", async () => {
            await expect(veNFTE.connect(bob).deposit_for(alice.address, 0)).to.be.reverted
        })

        it("force error, no existing lock", async () => {
            await expect(veNFTE.connect(bob).deposit_for(bob.address, 100)).to.be.revertedWith("No existing lock found")
        })

        it("force error, lock is expired", async () => {
            const lastTimestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [lastTimestamp + 2 * WEEK])

            await expect(veNFTE.connect(bob).deposit_for(alice.address, 100)).to.be.revertedWith(
                "Cannot add to expired lock. Withdraw",
            )
        })

        it("deposit for alice", async () => {
            const oldLock = await veNFTE.locked(alice.address)
            await expect(() =>
            veNFTE.connect(bob).deposit_for(alice.address, parseEther("100")),
            ).to.changeTokenBalances(testNFTE, [veNFTE, alice, bob], [parseEther("100"), 0, parseEther("-100")])

            const newLock = await veNFTE.locked(alice.address)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))
            expect(newLock.end).to.be.eq(oldLock.end)

            await checkNfteBalance()
        })
    })

    describe("increase unlock time", async () => {
        let lastTimestamp: number

        beforeEach(async () => {
            lastTimestamp = await getLatestTimestamp()
            await veNFTE.connect(alice).create_lock(parseEther("100"), lastTimestamp + WEEK)
        })

        it("increase unlock time for another 1 week", async () => {
            const oldLock = await veNFTE.locked(alice.address)
            const lastTimestamp = await getLatestTimestamp()

            // increase unlock time for 1 week
            const tx = veNFTE.connect(alice).increase_unlock_time(oldLock.end.add(WEEK))
            await expect(tx)
                .to.emit(veNFTE, "Deposit")
                .withArgs(alice.address, "0", oldLock.end.add(WEEK), 3, lastTimestamp + 1)
            await expect(tx).to.emit(veNFTE, "Supply").withArgs(parseEther("100"), parseEther("100"))

            const newLock = await veNFTE.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end.add(WEEK))
            expect(newLock.amount).to.be.eq(oldLock.amount)

            await checkNfteBalance()
        })

        it("force error, lock expired", async () => {
            const oldLock = await veNFTE.locked(alice.address)

            await waffle.provider.send("evm_setNextBlockTimestamp", [oldLock.end.toNumber() + DAY])
            await waffle.provider.send("evm_mine", [])
            lastTimestamp = await getLatestTimestamp()

            await expect(veNFTE.connect(alice).increase_unlock_time(lastTimestamp)).to.be.revertedWith("Lock expired")
        })

        it("force error, lock time exceeds max lock time", async () => {
            await expect(veNFTE.connect(alice).increase_unlock_time(lastTimestamp + 2 * YEAR)).to.be.revertedWith(
                "Voting lock can be 1 year max",
            )
        })

        it("force error, can only increase lock duration", async () => {
            await expect(veNFTE.connect(alice).increase_unlock_time(lastTimestamp + WEEK)).to.be.revertedWith(
                "Can only increase lock duration",
            )
        })
    })

    describe("increase lock amount", () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)
        })

        it("force error, value is zero", async () => {
            await expect(veNFTE.connect(alice).increase_amount(parseEther("0"))).to.be.reverted
        })

        it("force error, lock amount is zero", async () => {
            await expect(veNFTE.connect(bob).increase_amount(parseEther("100"))).to.be.revertedWith(
                "No existing lock found",
            )
        })

        it("force error, lock is expired", async () => {
            const timestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])
            await waffle.provider.send("evm_mine", [])

            await expect(veNFTE.connect(alice).increase_amount(parseEther("100"))).to.be.revertedWith(
                "Cannot add to expired lock. Withdraw",
            )
        })

        it("increase amount", async () => {
            const oldLock = await veNFTE.locked(alice.address)

            await expect(() => veNFTE.connect(alice).increase_amount(parseEther("100"))).to.changeTokenBalances(
                testNFTE,
                [veNFTE, alice],
                [parseEther("100"), parseEther("-100")],
            )

            const newLock = await veNFTE.locked(alice.address)

            expect(newLock.end).to.be.eq(oldLock.end)
            expect(newLock.amount).to.be.eq(oldLock.amount.add(parseEther("100")))

            await checkNfteBalance()
        })
    })

    describe("withdraw", async () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + WEEK)
        })

        it("force error, lock is not expired", async () => {
            await expect(veNFTE.connect(alice).withdraw()).to.be.revertedWith("The lock didn't expire")
        })

        it("withdraw when lock expired", async () => {
            const timestamp = await getLatestTimestamp()
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])

            await expect(() => veNFTE.connect(alice).withdraw()).to.changeTokenBalance(
                testNFTE,
                alice,
                parseEther("100"),
            )

            const newLock = await veNFTE.locked(alice.address)

            expect(newLock.amount).to.be.eq(parseEther("0"))
            expect(await testNFTE.balanceOf(alice.address)).to.be.eq(parseEther("1000"))

            await checkNfteBalance()
        })

        it("withdraw after 5 years with reasonable gas usage as long as it is checkpointed frequently", async () => {
            let nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp])
            const lockAmount = parseEther("100")

            await veNFTE.connect(bob).create_lock(lockAmount, nextWeekTimestamp + 0.25 * YEAR)

            nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + 5 * YEAR])

            // if no one to call checkpoint to update contract status, the
            // original withdraw tx will use gas: 19406360
            await veNFTE.checkpoint()

            // gasUsed: 539186
            const withdrawTx = await (await veNFTE.connect(bob).withdraw()).wait()
            expect(withdrawTx.gasUsed).to.be.lt("600000")
        })
    })

    describe("point history", async () => {
        it("point timestamp of current epoch is not necessarily aligned by week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            // off by 1 second so we know that the next tx would not be aligned by week
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + 1])

            await veNFTE.connect(alice).create_lock(parseEther("100"), nextWeekTimestamp + WEEK + 1)

            const epoch = await veNFTE.epoch()
            const point = await veNFTE.point_history(epoch)
            expect(point.ts).to.be.eq(nextWeekTimestamp + 1)
        })

        it("filled history points are aligned by week", async () => {
            const nextWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)

            // epoch 0 checkpoint @ nextWeekTimestamp + 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + 1])
            await veNFTE.connect(alice).create_lock(parseEther("100"), nextWeekTimestamp + WEEK * 3)

            // epoch 2 checkpoint @ nextWeekTimestamp + WEEK + 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [nextWeekTimestamp + WEEK + 1])
            await veNFTE.connect(bob).create_lock(parseEther("100"), nextWeekTimestamp + WEEK * 3)

            // epoch 1 should be retro-checkpoint @ nextWeekTimestamp + WEEK
            const epoch = await veNFTE.epoch()
            const point = await veNFTE.point_history(epoch.sub(1))
            expect(point.ts).to.be.eq(nextWeekTimestamp + WEEK)
        })
    })

    describe("get voting power and total supply in history epoch", async () => {
        let week1Timestamp
        let week2Timestamp
        let week3Timestamp
        let week4Timestamp
        let week5Timestamp
        let week6Timestamp
        let week7Timestamp

        const lockAmount = parseEther("100")
        const slope = lockAmount.div(YEAR)
        let startBlockNumber: number

        beforeEach(async () => {
            startBlockNumber = await getLatestBlock()
            const startWeekTimestamp = getWeekTimestamp(await getLatestTimestamp(), false)
            week1Timestamp = startWeekTimestamp + WEEK
            week2Timestamp = startWeekTimestamp + WEEK * 2
            week3Timestamp = startWeekTimestamp + WEEK * 3
            week4Timestamp = startWeekTimestamp + WEEK * 4
            week5Timestamp = startWeekTimestamp + WEEK * 5
            week6Timestamp = startWeekTimestamp + WEEK * 6
            week7Timestamp = startWeekTimestamp + WEEK * 7

            // week 1
            await waffle.provider.send("evm_setNextBlockTimestamp", [week1Timestamp])
            await veNFTE.connect(alice).create_lock(lockAmount, week1Timestamp + 5 * WEEK)

            await waffle.provider.send("evm_setNextBlockTimestamp", [week1Timestamp + 2 * DAY])
            await veNFTE.connect(bob).create_lock(lockAmount, week1Timestamp + WEEK)

            // week 2~3

            // week 4
            await waffle.provider.send("evm_setNextBlockTimestamp", [week4Timestamp])
            await veNFTE.connect(carol).create_lock(lockAmount, week4Timestamp + WEEK)

            // week 5
            await waffle.provider.send("evm_setNextBlockTimestamp", [week5Timestamp])
            // alice original expired at week6, new expire time will be week7
            await veNFTE.connect(alice).increase_unlock_time(week5Timestamp + 2 * WEEK)
        })

        it("get history voting powers & total supply", async () => {
            // assume current time is week5

            // get historical data
            const balanceWeek1 = await veNFTE["balanceOf(address,uint256)"](alice.address, week1Timestamp)
            expect(balanceWeek1).to.be.eq(slope.mul(5 * WEEK))
            expect(await veNFTE["balanceOfAt(address,uint256)"](alice.address, startBlockNumber + 1)).to.be.eq(
                balanceWeek1,
            )

            const balanceWeek2 = await veNFTE["balanceOf(address,uint256)"](alice.address, week2Timestamp)
            expect(balanceWeek2).to.be.eq(slope.mul(4 * WEEK))

            const balanceWeek3 = await veNFTE["balanceOf(address,uint256)"](alice.address, week3Timestamp)
            expect(balanceWeek3).to.be.eq(slope.mul(3 * WEEK))

            const balanceWeek3Weighted = await veNFTE["balanceOfWeighted(address,uint256)"](
                alice.address,
                week3Timestamp,
            )
            expect(balanceWeek3Weighted).to.be.eq(lockAmount.add(slope.mul(3 * WEEK).mul(3)))

            // alice increased unlock time on week 5, so she still has 2 weeks to unlock
            const balanceWeek5 = await veNFTE["balanceOf(address,uint256)"](alice.address, week5Timestamp)
            expect(balanceWeek5).to.be.eq(slope.mul(2 * WEEK))
            expect(await veNFTE["balanceOfAt(address,uint256)"](alice.address, startBlockNumber + 4)).to.be.eq(
                balanceWeek5,
            )

            // get future data
            const balanceWeek6 = await veNFTE["balanceOf(address,uint256)"](alice.address, week6Timestamp)
            expect(balanceWeek6).to.be.eq(slope.mul(1 * WEEK))

            // alice's lock is expired
            const balanceWeek7 = await veNFTE["balanceOf(address,uint256)"](alice.address, week7Timestamp)
            const balanceWeek7Weighted = await veNFTE["balanceOfWeighted(address,uint256)"](
                alice.address,
                week7Timestamp,
            )

            expect(balanceWeek7).to.be.eq("0")
            expect(balanceWeek7Weighted).to.be.eq(lockAmount)
            // get history total supply
            const totalSupplyWeek1 = await veNFTE["totalSupply(uint256)"](week1Timestamp)
            expect(totalSupplyWeek1).to.be.eq(await veNFTE["balanceOf(address,uint256)"](alice.address, week1Timestamp))
            expect(totalSupplyWeek1).to.be.eq(await veNFTE["totalSupplyAt(uint256)"](startBlockNumber + 1))

            const totalSupplyWeek2 = await veNFTE["totalSupply(uint256)"](week2Timestamp)
            const aliceBalanceWeek2 = await veNFTE["balanceOf(address,uint256)"](alice.address, week2Timestamp)
            const bobBalanceWeek2 = await veNFTE["balanceOf(address,uint256)"](bob.address, week2Timestamp)
            expect(totalSupplyWeek2).to.be.eq(aliceBalanceWeek2.add(bobBalanceWeek2))

            const totalSupplyWeek3 = await veNFTE["totalSupply(uint256)"](week3Timestamp)
            const aliceBalanceWeek3 = await veNFTE["balanceOf(address,uint256)"](alice.address, week3Timestamp)
            const bobBalanceWeek3 = await veNFTE["balanceOf(address,uint256)"](bob.address, week3Timestamp)
            expect(totalSupplyWeek3).to.be.eq(aliceBalanceWeek3.add(bobBalanceWeek3))

            const totalSupplyWeightedWeek3 = await veNFTE["totalSupplyWeighted(uint256)"](week3Timestamp)
            const aliceBalanceWeightedWeek3 = await veNFTE["balanceOfWeighted(address,uint256)"](
                alice.address,
                week3Timestamp,
            )
            const bobBalanceWeightedWeek3 = await veNFTE["balanceOfWeighted(address,uint256)"](
                bob.address,
                week3Timestamp,
            )
            expect(totalSupplyWeightedWeek3).to.be.eq(aliceBalanceWeightedWeek3.add(bobBalanceWeightedWeek3))

            const totalSupplyWeek4 = await veNFTE["totalSupply(uint256)"](week4Timestamp)
            const aliceBalanceWeek4 = await veNFTE["balanceOf(address,uint256)"](alice.address, week4Timestamp)
            const bobBalanceWeek4 = await veNFTE["balanceOf(address,uint256)"](bob.address, week4Timestamp)
            const carolBalanceWeek4 = await veNFTE["balanceOf(address,uint256)"](carol.address, week4Timestamp)
            expect(totalSupplyWeek4).to.be.eq(aliceBalanceWeek4.add(bobBalanceWeek4).add(carolBalanceWeek4))

            // get future total supply

            const totalSupplyWeek7 = await veNFTE["totalSupply(uint256)"](week7Timestamp)
            expect(totalSupplyWeek7).to.be.eq("0")

            const totalSupplyWeightedWeek7 = await veNFTE["totalSupplyWeighted(uint256)"](week7Timestamp)
            // sum of alice & bob & carol's lock amount
            expect(totalSupplyWeightedWeek7).to.be.eq(lockAmount.mul(3))

            // return 0 when timestamp is before week 0
            const timestampBeforeWeek1 = week1Timestamp - 100
            expect(await veNFTE["totalSupply(uint256)"](timestampBeforeWeek1)).to.be.eq("0")
            expect(await veNFTE["balanceOf(address,uint256)"](alice.address, timestampBeforeWeek1)).to.be.eq("0")

            await checkNfteBalance()
        })
    })

    describe("emergency unlock", async () => {
        beforeEach(async () => {
            const timestamp = await getLatestTimestamp()
            await veNFTE.connect(alice).create_lock(parseEther("100"), timestamp + 5 * WEEK)
            await veNFTE.connect(bob).create_lock(parseEther("100"), timestamp + WEEK)
            await waffle.provider.send("evm_setNextBlockTimestamp", [timestamp + 2 * WEEK])
        })

        it("force error, only admin", async () => {
            await expect(veNFTE.connect(alice).toggleEmergencyUnlock()).to.be.reverted
        })

        it("withdraw after emergency unlock", async () => {
            await veNFTE.connect(admin).toggleEmergencyUnlock()

            const timestamp = await getLatestTimestamp()
            await expect(veNFTE.connect(alice).withdraw())
                .to.emit(veNFTE, "Withdraw")
                .withArgs(alice.address, parseEther("100"), timestamp + 1)
                .to.emit(veNFTE, "Supply")
                .withArgs(parseEther("200"), parseEther("100"))

            await expect(veNFTE.connect(bob).withdraw())
                .to.emit(veNFTE, "Withdraw")
                .withArgs(bob.address, parseEther("100"), timestamp + 2)
                .to.emit(veNFTE, "Supply")
                .withArgs(parseEther("100"), parseEther("0"))

            await checkNfteBalance()
        })
    })

    describe("admin ownership", async () => {
        it("force error, non-admin call commit transfer ownership", async () => {
            await expect(veNFTE.connect(alice).commit_transfer_ownership(alice.address)).to.be.reverted
        })

        it("force error, non-admin call apply transfer ownership", async () => {
            await expect(veNFTE.connect(alice).commit_transfer_ownership(alice.address)).to.be.reverted
        })

        it("force error, future admin not set", async () => {
            await expect(veNFTE.connect(admin).apply_transfer_ownership()).to.be.reverted
        })

        it("admin transfer ownership", async () => {
            await expect(veNFTE.connect(admin).commit_transfer_ownership(alice.address))
                .to.emit(veNFTE, "CommitOwnership")
                .withArgs(alice.address)

            expect(await veNFTE.future_admin()).to.be.eq(alice.address)

            await expect(veNFTE.connect(admin).apply_transfer_ownership())
                .to.emit(veNFTE, "ApplyOwnership")
                .withArgs(alice.address)

            expect(await veNFTE.admin()).to.be.eq(alice.address)
        })
    })

    describe("recoverERC20", () => {
        const amount = parseUnits("100", 6)
        let mockTestERC20: MockContract<TestERC20>

        beforeEach(async () => {
            const mockTestERC20Factory = await smock.mock<TestERC20__factory>("TestERC20")
            mockTestERC20 = await mockTestERC20Factory.deploy()
            await mockTestERC20.__TestERC20_init("MockTestERC20", "MockTestERC20", 18)

            await mockTestERC20.connect(admin).mint(veNFTE.address, amount)
        })

        it("force error, when caller is not admin", async () => {
            await expect(veNFTE.connect(alice).recoverERC20(mockTestERC20.address, amount)).to.be.reverted
        })

        it("force error, when token is NFTE", async () => {
            await expect(veNFTE.connect(admin).recoverERC20(veNFTE.address, amount)).to.be.reverted
        })

        it("recover amount when non-standard ERC20", async () => {
            mockTestERC20.transfer.returns(false)

            await veNFTE.connect(admin).recoverERC20(mockTestERC20.address, amount)

            const balance = await mockTestERC20.balanceOf(veNFTE.address)
            expect(balance).to.be.eq(0)
        })

        it("recover amount when standard ERC20", async () => {
            await veNFTE.connect(admin).recoverERC20(mockTestERC20.address, amount)

            const balance = await mockTestERC20.balanceOf(veNFTE.address)
            expect(balance).to.be.eq(0)
        })
    })
})
