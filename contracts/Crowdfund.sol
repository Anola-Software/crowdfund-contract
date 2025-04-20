// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract Crowdfund is ReentrancyGuard, Ownable {
  uint256 public goal;
  uint256 public deadline;
  uint256 public minContribution;
  uint256 public totalCollected = 0;
  bool public isCancelled = false;
  mapping(address => uint256) public contributions;

  event CampaignCreated(
    address owner,
    uint256 goal,
    uint256 deadline,
    uint256 minContribution
  );
  event ContributionReceived(address contributor, uint256 amount);
  event FundsWithdrawn(address owner, uint256 amount);
  event RefundIssued(address contributor, uint256 amount);
  event DeadlineExtended(uint256 oldDeadline, uint256 newDeadline);
  event CampaignCancelled();

  constructor(
    uint256 _goal,
    uint256 _deadline,
    uint256 _minContribution
  ) Ownable(msg.sender) {
    require(_deadline > block.timestamp, 'Invalid deadline');
    require(_goal > 0, 'Invalid goal');

    goal = _goal;
    deadline = _deadline;
    minContribution = _minContribution;

    emit CampaignCreated(msg.sender, goal, deadline, minContribution);
  }

  function contribute() external payable nonReentrant {
    require(!isCancelled, 'Campaign is cancelled');
    if (minContribution == 0) {
      require(msg.value > 0, 'Contribution must be greater than 0 wei');
    } else {
      require(
        msg.value >= minContribution,
        'Contribution must be greater than or equal to min contribution'
      );
    }
    require(goal > totalCollected, 'Campaign is over');
    require(block.timestamp < deadline, 'Campaign is over');

    contributions[msg.sender] += msg.value;
    totalCollected += msg.value;

    emit ContributionReceived(msg.sender, msg.value);
  }

  function withdrawFunds() external onlyOwner nonReentrant {
    require(totalCollected >= goal, 'No funds to withdraw');

    address payable _owner = payable(msg.sender);
    _owner.transfer(address(this).balance);

    emit FundsWithdrawn(msg.sender, totalCollected);
    totalCollected = 0;
  }

  function refund() external nonReentrant {
    if (!isCancelled) {
      require(totalCollected < goal, 'Campaign reached its goal');
      require(block.timestamp >= deadline, 'Campaign is not over yet');
    }
    require(contributions[msg.sender] > 0, 'No contributions to refund');

    address payable _sender = payable(msg.sender);
    _sender.transfer(contributions[msg.sender]);

    emit RefundIssued(msg.sender, contributions[msg.sender]);
    contributions[msg.sender] = 0;
    // not setting totalCollected to 0
    //  so that people can see how much the crowdfund raised
  }

  function extendDeadline(uint256 _newDeadline) external onlyOwner {
    require(!isCancelled, 'Campaign is cancelled');
    require(
      _newDeadline > block.timestamp && _newDeadline > deadline,
      'Invalid deadline'
    );

    uint256 _oldDeadline = deadline;
    deadline = _newDeadline;
    emit DeadlineExtended(_oldDeadline, deadline);
  }

  function cancelCampaign() external onlyOwner {
    require(!isCancelled, 'Campaign is already cancelled');
    isCancelled = true;
    emit CampaignCancelled();
  }
}
