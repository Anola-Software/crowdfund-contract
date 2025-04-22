import {
  time,
  loadFixture,
} from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import hre from 'hardhat';

describe('Crowdfund', () => {
  const deployFixture = async () => {
    const ONE_DAY_IN_SEC = 24 * 60 * 60;
    const deadline = (await time.latest()) + ONE_DAY_IN_SEC;
    const minAmount = ethers.parseEther('0.01');
    const goal = ethers.parseEther('2');

    const [owner, account1, account2] = await hre.ethers.getSigners();

    const Crowdfund = await hre.ethers.getContractFactory('Crowdfund');
    const crowdfund = await Crowdfund.deploy(goal, deadline, minAmount);

    return { crowdfund, deadline, minAmount, goal, owner, account1, account2 };
  };

  describe('Deployment', () => {
    it('Should set the right owner', async () => {
      const { crowdfund, owner } = await loadFixture(deployFixture);
      expect(await crowdfund.owner()).to.equal(owner.address, 'Invalid owner');
    });

    it('Should emit CampaignCreated event on deployment', async () => {
      const Crowdfund = await hre.ethers.getContractFactory('Crowdfund');
      const [owner] = await hre.ethers.getSigners();
      const ONE_DAY_IN_SEC = 24 * 60 * 60;
      const deadline = (await time.latest()) + ONE_DAY_IN_SEC;
      const minAmount = ethers.parseEther('0.01');
      const goal = ethers.parseEther('2');

      const crowdfund = await Crowdfund.connect(owner).deploy(
        goal,
        deadline,
        minAmount
      );

      await expect(crowdfund.deploymentTransaction())
        .to.emit(crowdfund, 'CampaignCreated')
        .withArgs(owner.address, goal, deadline, minAmount);
    });

    it('Should set the right parameters', async () => {
      const { crowdfund, goal, minAmount, deadline } =
        await loadFixture(deployFixture);
      expect(await crowdfund.goal()).to.equal(goal, 'Invalid goal');
      expect(await crowdfund.deadline()).to.equal(deadline, 'Invalid deadline');
      expect(await crowdfund.minContribution()).to.equal(
        minAmount,
        'Invalid minContribution'
      );
    });

    it('Should revert if deadline is in the past', async () => {
      const Crowdfund = await hre.ethers.getContractFactory('Crowdfund');
      const [owner] = await hre.ethers.getSigners();
      const ONE_DAY_IN_SEC = 24 * 60 * 60;
      const deadline = (await time.latest()) - ONE_DAY_IN_SEC;
      const minAmount = ethers.parseEther('0.01');
      const goal = ethers.parseEther('2');

      await expect(
        Crowdfund.connect(owner).deploy(goal, deadline, minAmount)
      ).to.be.revertedWith('Invalid deadline');
    });

    it('Should revert if invalid goal', async () => {
      const Crowdfund = await hre.ethers.getContractFactory('Crowdfund');
      const [owner] = await hre.ethers.getSigners();
      const ONE_DAY_IN_SEC = 24 * 60 * 60;
      const deadline = (await time.latest()) + ONE_DAY_IN_SEC;
      const minAmount = ethers.parseEther('0.01');
      const goal = 0;

      await expect(
        Crowdfund.connect(owner).deploy(goal, deadline, minAmount)
      ).to.be.revertedWith('Invalid goal');
    });
  });

  describe('Contribute', async () => {
    it('Should allow contribution', async () => {
      const { crowdfund, account1, minAmount } =
        await loadFixture(deployFixture);

      const acc1BalanceBefore = await hre.ethers.provider.getBalance(
        account1.address
      );

      await expect(crowdfund.connect(account1).contribute({ value: minAmount }))
        .to.emit(crowdfund, 'ContributionReceived')
        .withArgs(account1.address, minAmount);

      await expect(crowdfund.connect(account1).contribute({ value: minAmount }))
        .to.emit(crowdfund, 'ContributionReceived')
        .withArgs(account1.address, minAmount);

      const acc1BalanceAfter = await hre.ethers.provider.getBalance(
        account1.address
      );

      expect(acc1BalanceBefore).to.be.greaterThan(
        acc1BalanceAfter,
        'Invalid account1 balance'
      );

      expect(await crowdfund.contributions(account1.address)).to.equal(
        minAmount * 2n,
        'Invalid contribution'
      );
      expect(await crowdfund.totalCollected()).to.equal(
        minAmount * 2n,
        'Invalid totalCollected'
      );
    });

    it('Should revert if campaign is cancelled', async () => {
      const { crowdfund, minAmount, account1 } =
        await loadFixture(deployFixture);
      await crowdfund.cancelCampaign();

      await expect(
        crowdfund.connect(account1).contribute({ value: minAmount })
      ).to.be.revertedWith('Campaign is cancelled');
    });

    it('Should revert if msg.value is 0 and minContribution is 0', async () => {
      const fixture = async () => {
        const ONE_DAY_IN_SEC = 24 * 60 * 60;
        const deadline = (await time.latest()) + ONE_DAY_IN_SEC;
        const goal = ethers.parseEther('2');
        const minAmount = 0n;

        const accounts = await hre.ethers.getSigners();
        const Crowdfund = await hre.ethers.getContractFactory('Crowdfund');
        const crowdfund = await Crowdfund.deploy(goal, deadline, minAmount);
        return { crowdfund, account1: accounts[1] };
      };

      const { crowdfund, account1 } = await loadFixture(fixture);

      await expect(
        crowdfund.connect(account1).contribute({ value: 0 })
      ).to.be.revertedWith(
        'Contribution must be greater than or equal to min contribution'
      );
    });

    it('Should revert if msg.value < minContribution', async () => {
      const { crowdfund, minAmount, account1 } =
        await loadFixture(deployFixture);
      const smallValue = minAmount - 1n;

      await expect(
        crowdfund.connect(account1).contribute({ value: smallValue })
      ).to.be.revertedWith(
        'Contribution must be greater than or equal to min contribution'
      );
    });

    it('Should revert if campaign goal is already met', async () => {
      const { crowdfund, goal, minAmount, account1 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: goal });

      await expect(
        crowdfund.connect(account1).contribute({ value: minAmount })
      ).to.be.revertedWith('Campaign is over');
    });

    it('Should revert if current time is past deadline', async () => {
      const { crowdfund, minAmount, deadline, account1 } =
        await loadFixture(deployFixture);
      await time.increase(deadline + 1);

      await expect(
        crowdfund.connect(account1).contribute({ value: minAmount })
      ).to.be.revertedWith('Campaign is over');
    });
  });

  describe('Withdraw', async () => {
    it('Should allow owner to withdraw funds', async () => {
      const { crowdfund, owner, goal, minAmount, account1, account2 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: minAmount });
      await crowdfund.connect(account2).contribute({ value: goal });

      await expect(crowdfund.withdrawFunds())
        .to.emit(crowdfund, 'FundsWithdrawn')
        .withArgs(owner.address, goal + minAmount);

      expect(await crowdfund.contributions(account1.address)).to.equal(
        minAmount,
        'Invalid contribution from account1'
      );
      expect(await crowdfund.contributions(account2.address)).to.equal(
        goal,
        'Invalid contribution from account2'
      );
    });

    it("Shouldn't allow owner to withdrawc twice", async () => {
      const { crowdfund, owner, goal, minAmount, account1, account2 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: minAmount });
      await crowdfund.connect(account2).contribute({ value: goal });

      await expect(crowdfund.withdrawFunds())
        .to.emit(crowdfund, 'FundsWithdrawn')
        .withArgs(owner.address, goal + minAmount);

      await expect(crowdfund.withdrawFunds()).to.be.revertedWith(
        'Funds already withdrawn'
      );

      expect(await crowdfund.contributions(account1.address)).to.equal(
        minAmount,
        'Invalid contribution from account1'
      );
      expect(await crowdfund.contributions(account2.address)).to.equal(
        goal,
        'Invalid contribution from account2'
      );
    });

    it('Should revert if totalCollected < goal', async () => {
      const { crowdfund, minAmount, account1 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: minAmount });
      await expect(crowdfund.withdrawFunds()).to.be.revertedWith(
        'Goal is not reached'
      );
    });

    it('Should revert if not owner', async () => {
      const { crowdfund, goal, account1, account2 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: goal });
      await expect(crowdfund.connect(account2).withdrawFunds())
        .to.be.revertedWithCustomError(crowdfund, 'OwnableUnauthorizedAccount')
        .withArgs(account2.address);
    });
  });

  describe('Refund', async () => {
    it('Should allow contributor to refund', async () => {
      const { crowdfund, deadline, minAmount, account1 } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: minAmount * 2n });
      const contributorBalanceBefore = await hre.ethers.provider.getBalance(
        account1.address
      );

      await time.increase(deadline);

      await expect(crowdfund.connect(account1).refund())
        .to.emit(crowdfund, 'RefundIssued')
        .withArgs(account1.address, minAmount * 2n);

      const contributorBalanceAfter = await hre.ethers.provider.getBalance(
        account1.address
      );

      expect(contributorBalanceBefore).to.be.lessThan(
        contributorBalanceAfter,
        'Invalid account1 balance'
      );

      expect(await crowdfund.contributions(account1.address)).to.equal(
        0n,
        'Invalid contribution'
      );
      expect(await crowdfund.totalCollected()).to.equal(
        minAmount * 2n,
        'Invalid totalCollected'
      );
    });

    it('Should allow contributor to refund if campaign is cancelled', async () => {
      const { crowdfund, account1, goal } = await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: goal });
      await crowdfund.cancelCampaign();

      await expect(crowdfund.connect(account1).refund())
        .to.emit(crowdfund, 'RefundIssued')
        .withArgs(account1.address, goal);
    });

    it('Should revert if campaign is not cancelled and goal is reached', async () => {
      const { crowdfund, account1, goal } = await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: goal });
      await time.increase(60 * 60 * 24 + 1);

      await expect(crowdfund.connect(account1).refund()).to.be.revertedWith(
        'Campaign reached its goal'
      );
    });

    it('Should revert if campaign is not cancelled and deadline not yet passed', async () => {
      const { crowdfund, account1, minAmount } =
        await loadFixture(deployFixture);
      await crowdfund.connect(account1).contribute({ value: minAmount });
      await expect(crowdfund.connect(account1).refund()).to.be.revertedWith(
        'Campaign is not over yet'
      );
    });

    it('Should revert if caller has no contributions', async () => {
      const { crowdfund, account1, account2, minAmount } =
        await loadFixture(deployFixture);

      await crowdfund.connect(account1).contribute({ value: minAmount });
      await time.increase(24 * 60 * 60 + 1);
      await expect(crowdfund.connect(account2).refund()).to.be.revertedWith(
        'No contributions to refund'
      );
    });
  });

  describe('Extend Deadline', async () => {
    it('Should allow owner to extend deadline', async () => {
      const { crowdfund } = await loadFixture(deployFixture);
      const deadline = await crowdfund.deadline();
      const newDeadline = deadline + BigInt(24 * 60 * 60);
      await expect(crowdfund.extendDeadline(newDeadline))
        .to.emit(crowdfund, 'DeadlineExtended')
        .withArgs(deadline, newDeadline);

      expect(await crowdfund.deadline()).to.equal(
        newDeadline,
        'Invalid deadline'
      );
    });

    it('Should revert if not owner', async () => {
      const { crowdfund, account1 } = await loadFixture(deployFixture);
      const deadline = await crowdfund.deadline();
      const newDeadline = deadline + BigInt(24 * 60 * 60);
      await expect(crowdfund.connect(account1).extendDeadline(newDeadline))
        .to.be.revertedWithCustomError(crowdfund, 'OwnableUnauthorizedAccount')
        .withArgs(account1.address);
    });

    it('Should revert if invalid deadline', async () => {
      const { crowdfund } = await loadFixture(deployFixture);
      const deadline = await crowdfund.deadline();
      const newDeadline = deadline;
      await expect(crowdfund.extendDeadline(newDeadline)).to.be.revertedWith(
        'Invalid deadline'
      );
    });
  });

  describe('Cancel Campaign', async () => {
    it('Should allow owner to cancel campaign', async () => {
      const { crowdfund } = await loadFixture(deployFixture);
      await expect(crowdfund.cancelCampaign())
        .to.emit(crowdfund, 'CampaignCancelled')
        .withArgs();

      expect(await crowdfund.isCancelled()).to.equal(
        true,
        'Invalid campaignCancelled'
      );
    });

    it('Should revert if not owner', async () => {
      const { crowdfund, account1 } = await loadFixture(deployFixture);
      await expect(crowdfund.connect(account1).cancelCampaign())
        .to.be.revertedWithCustomError(crowdfund, 'OwnableUnauthorizedAccount')
        .withArgs(account1.address);
    });

    it('Should revert if campaign is already cancelled', async () => {
      const { crowdfund } = await loadFixture(deployFixture);
      await crowdfund.cancelCampaign();
      await expect(crowdfund.cancelCampaign()).to.be.revertedWith(
        'Campaign is already cancelled'
      );
    });
  });
});
