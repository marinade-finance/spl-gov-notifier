import { PublicKey } from '@solana/web3.js'
import {
  getGovernanceAccounts,
  Governance,
  GovernanceAccountParser,
  ProgramAccount,
  Proposal,
  ProposalState,
  pubkeyFilter,
  Realm,
} from '@solana/spl-governance'
import { Command } from 'commander'
import { parsePubkey } from '@marinade.finance/cli-common'
import { MNDE_REALM_ADDRESS } from '@marinade.finance/spl-gov-utils'
import { useContext } from './context'
import { accountsToPubkeyMap } from './utils'
import { notify } from './notifier'
import { Logger } from 'pino'

// advanced from https://github.com/solana-labs/governance-ui
//  - expecting to be run every X mins via a cronjob
//  - checking if a governance proposal just opened in the last X mins
//  - notifies on WEBHOOK_URL if a new governance proposal was created

const REDIS_KEY = 'spl-gov-notifier:proposals_timestamp'
const fiveMinutesInSeconds = 5 * 60
const toleranceInSeconds = 30

export function installCheckProposals(program: Command) {
  program
    .command('proposals')
    .description('Verify existence of governance proposals in last time period')
    .option(
      '-r, --realm <realm>',
      'Realm to check proposals for',
      parsePubkey,
      Promise.resolve(MNDE_REALM_ADDRESS)
    )
    .option(
      '-t, --time-to-check <seconds>',
      'How many seconds in past should be checked for new proposals in the realm; default 5 minutes',
      parseFloat,
      fiveMinutesInSeconds
    )
    .action(
      async ({
        realm,
        timeToCheck,
      }: {
        realm: Promise<PublicKey>
        timeToCheck: number
      }) => {
        await checkProposals({
          realm: await realm,
          timeToCheck,
        })
      }
    )
}

export async function checkProposals({
  realm,
  timeToCheck,
}: {
  realm: PublicKey
  timeToCheck: number
}): Promise<void> {
  const { connection, logger, redisClient } = useContext()
  logger.info(`getting all governance accounts for '${realm.toBase58()}'`)

  const realmAccount = await connection.getAccountInfo(realm)
  if (realmAccount === null) {
    throw new Error(
      `Realm ${realm.toBase58()} not found via RPC ${connection.rpcEndpoint}`
    )
  }
  const realmData: ProgramAccount<Realm> = GovernanceAccountParser(Realm)(
    realm,
    realmAccount
  )

  const governances = await getGovernanceAccounts(
    connection,
    realmAccount.owner,
    Governance,
    [pubkeyFilter(1, realm)!]
  )

  const governancesMap = accountsToPubkeyMap(governances)

  logger.info(
    `getting all proposals for all #${governances.length} governances`
  )
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap).map(governancePk => {
      return getGovernanceAccounts(connection, realmAccount.owner, Proposal, [
        pubkeyFilter(1, new PublicKey(governancePk))!,
      ])
    })
  )
  const proposals = proposalsByGovernance.flat()

  const realmUriComponent = encodeURIComponent(realm.toBase58())
  logger.info(
    `scanning all proposals from realm ${realm.toBase58()} #` + proposals.length
  )

  const nowInSeconds = new Date().getTime() / 1000

  // when redis url is available then timePeriod is adjusted
  // to verify if we have not missed any proposals
  if (redisClient) {
    const redisTimestamp = await redisClient.get(REDIS_KEY)
    const redisTimestampAsNumber = redisTimestamp
      ? parseInt(redisTimestamp)
      : null
    if (
      redisTimestampAsNumber !== null &&
      redisTimestampAsNumber < nowInSeconds - timeToCheck
    ) {
      timeToCheck = nowInSeconds - redisTimestampAsNumber
    }
  }

  let countJustOpenedForVoting = 0
  let countOpenForVotingSinceSomeTime = 0
  let countVotingNotStartedYet = 0
  let countClosed = 0
  let countCancelled = 0
  for (const proposal of proposals) {
    debugProposal(logger, proposal)
    const proposalUrl = `https://realms.today/dao/${realmUriComponent}/proposal/${proposal.pubkey.toBase58()}`
    // timestamp of the proposal is in seconds, typescript works with milliseconds
    const proposalVotingAt = proposal.account.votingAt
      ? new Date(proposal.account.votingAt.toNumber() * 1000)
      : undefined
    if (
      // proposal is cancelled
      proposal.account.state === ProposalState.Cancelled
    ) {
      countCancelled++
      continue
    }

    if (
      // voting is closed
      proposal.account.votingCompletedAt
    ) {
      countClosed++
      continue
    }

    if (
      // voting has not started yet
      !proposal.account.votingAt
    ) {
      countVotingNotStartedYet++
      continue
    }

    if (
      // proposal opened in last X mins
      nowInSeconds - proposal.account.votingAt.toNumber() <=
      timeToCheck + toleranceInSeconds
    ) {
      countJustOpenedForVoting++

      const votingSide = getVotingSide(realmData, proposal)
      const msg = `SPL Governance proposal '${proposal.account.name}' just opened for ${votingSide} voting`
      await notify(msg, proposalUrl, proposalVotingAt)
    }
    // note that these could also include those in finalizing state, but this is just for logging
    else if (proposal.account.state === ProposalState.Voting) {
      countOpenForVotingSinceSomeTime++
    }

    const baseVotingTime =
      governancesMap[proposal.account.governance.toBase58()].account.config
        .baseVotingTime
    const remainingVotingBaseTimeInSeconds =
      baseVotingTime + proposal.account.votingAt.toNumber() - nowInSeconds
    if (
      remainingVotingBaseTimeInSeconds > 86400 &&
      remainingVotingBaseTimeInSeconds <
        86400 + timeToCheck + toleranceInSeconds
    ) {
      const votingSide = getVotingSide(realmData, proposal)
      let msg = `SPL Governance proposal '${proposal.account.name}' will close for ${votingSide} voting in 24 hrs`
      const votingCoolOffTime =
        governancesMap[proposal.account.governance.toBase58()].account.config
          .votingCoolOffTime
      if (votingCoolOffTime > 0) {
        msg += ` (plus Proposal Cool-off Time ${
          votingCoolOffTime / 3600
        } hours that permits to withdraw votes)`
      }
      await notify(msg, proposalUrl, proposalVotingAt)
    }
  }

  if (redisClient) {
    await redisClient.set(
      REDIS_KEY,
      (nowInSeconds + toleranceInSeconds).toString()
    )
  }

  logger.info(
    `countOpenForVotingSinceSomeTime: ${countOpenForVotingSinceSomeTime}, ` +
      `countJustOpenedForVoting: ${countJustOpenedForVoting}, countVotingNotStartedYet: ${countVotingNotStartedYet}, ` +
      `countClosed: ${countClosed}, countCancelled: ${countCancelled}`
  )
}

function getStateKey(value: number): string | undefined {
  return Object.keys(ProposalState).find(key => ProposalState[value] === key)
}

function getVotingSide(
  realm: ProgramAccount<Realm>,
  proposal: ProgramAccount<Proposal>
): string {
  return proposal.account.governingTokenMint.equals(realm.account.communityMint)
    ? 'community'
    : 'council'
}

function debugProposal(logger: Logger, proposal: ProgramAccount<Proposal>) {
  logger.debug(
    'proposal: %s, name: %s, state: %s, completedAt: %s, votingAt: %s',
    proposal.pubkey.toBase58(),
    proposal.account.name,
    getStateKey(proposal.account.state),
    proposal.account.votingCompletedAt
      ? new Date(proposal.account.votingCompletedAt.toNumber() * 1000)
      : null,
    proposal.account.votingAt
      ? new Date(proposal.account.votingAt.toNumber() * 1000)
      : null
  )
}
