import { CliCommandError } from '@marinade.finance/cli-common'
import { MNDE_REALM_ADDRESS } from '@marinade.finance/spl-gov-utils'
import { parsePubkey } from '@marinade.finance/web3js-1x'
import {
  getGovernanceAccounts,
  Governance,
  GovernanceAccountParser,
  Proposal,
  ProposalState,
  pubkeyFilter,
  Realm,
} from '@realms-today/spl-governance'
import { PublicKey } from '@solana/web3.js'

import { useContext } from '../context'
import { sendNotifications } from '../notifier'
import { accountsToPubkeyMap } from '../utils'

import type { LoggerPlaceholder } from '@marinade.finance/ts-common'
import type { ProgramAccount } from '@realms-today/spl-governance'
import type { Command } from 'commander'

// advanced from https://github.com/solana-labs/governance-ui
//  - expecting to be run every X mins via a cronjob
//  - checking if a governance proposal just opened in the last X mins
//  - notifies on WEBHOOK_URL if a new governance proposal was created

const REDIS_KEY = 'spl-gov-notifier:proposals_timestamp'
const fiveMinutesInSeconds = 5 * 60
const oneDayInSeconds = 24 * 60 * 60 // 86400 seconds
const toleranceInSecondsDefault = 10

export function installCheckProposals(program: Command) {
  program
    .command('proposals')
    .description(
      'Verify existence of newly created governance proposals in last time period',
    )
    .option(
      '-r, --realm <realm>',
      `Realm to check proposals for (default: Marinade Finance ${MNDE_REALM_ADDRESS})`,
      parsePubkey,
    )
    .option(
      '-t, --time-to-check <seconds>',
      'Time window (in seconds) to look back for new proposals in the realm (default: 300s / 5 minutes)',
      v => parseInt(v, 10),
      fiveMinutesInSeconds,
    )
    .option(
      '--time-to-check-tolerance <seconds>',
      'Amount of time (in seconds) that is used as buffer for looking back to past as an addition to `--time-to-check` to not skip any notification ' +
        'when `--time-to-check` is defined for example for 5 minutes and cron job time goes every 5 minutes. ' +
        'When redis is defined then this value should be close to 0 to not double emit notifications.',
      v => parseInt(v, 10),
      toleranceInSecondsDefault,
    )
    .option(
      '--report-closed',
      'Report closed proposals. Normally, the notifier reports proposals opened in the last period (see --time-to-check). ' +
        'This option is useful for testing, allowing notifications for already closed proposals to verify if notifications work correctly.',
      false,
    )
    .action(
      async ({
        realm,
        timeToCheck,
        timeToCheckTolerance,
        reportClosed,
      }: {
        realm?: Promise<PublicKey>
        timeToCheck: number
        timeToCheckTolerance: number
        reportClosed: boolean
      }) => {
        await checkProposals({
          realm: await realm,
          lookBackPeriod: timeToCheck,
          toleranceInSeconds: timeToCheckTolerance,
          reportClosed,
        })
      },
    )
}

export async function checkProposals({
  realm = new PublicKey(MNDE_REALM_ADDRESS),
  lookBackPeriod,
  toleranceInSeconds,
  reportClosed,
}: {
  realm?: PublicKey
  lookBackPeriod: number
  toleranceInSeconds: number
  reportClosed: boolean
}): Promise<void> {
  const { connection, logger, redisClient } = useContext()
  logger.info(`getting all governance accounts for '${realm.toBase58()}'`)

  const realmAccount = await connection.getAccountInfo(realm)
  if (realmAccount === null) {
    throw new Error(
      `Realm ${realm.toBase58()} not found via RPC ${connection.rpcEndpoint}`,
    )
  }
  const realmData: ProgramAccount<Realm> = GovernanceAccountParser(Realm)(
    realm,
    realmAccount,
  )

  const realmFilter = pubkeyFilter(1, realm)
  if (!realmFilter) {
    throw CliCommandError.instance(
      `Cannot find realmFilter for realm pubkey '${realm.toBase58()}'`,
    )
  }
  const governances = await getGovernanceAccounts(
    connection,
    realmAccount.owner,
    Governance,
    [realmFilter],
  )

  const governancesMap = accountsToPubkeyMap(governances)

  logger.info(
    `getting all proposals for all #${governances.length} governances`,
  )
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap)
      .map(governancePk => pubkeyFilter(1, new PublicKey(governancePk)))
      .filter(governanceFilter => governanceFilter !== undefined)
      .map(governanceFilter => {
        return getGovernanceAccounts(connection, realmAccount.owner, Proposal, [
          governanceFilter,
        ])
      }),
  )
  const proposals = proposalsByGovernance.flat()

  const realmUriComponent = encodeURIComponent(realm.toBase58())
  logger.info(
    `scanning all proposals from realm ${realm.toBase58()} #` +
      proposals.length,
  )

  // cli timestamp works in seconds, typescript works with milliseconds
  const currentTimestamp = Math.floor(new Date().getTime() / 1000)

  // when redis url is available then timePeriod is adjusted
  // to verify if we have not missed any proposals
  let lookBackPeriodDefined = lookBackPeriod
  if (redisClient) {
    const redisTimestampData = await redisClient.get(REDIS_KEY)
    const redisTimestamp = redisTimestampData
      ? parseInt(redisTimestampData)
      : null
    if (
      redisTimestamp !== null &&
      redisTimestamp < currentTimestamp - lookBackPeriodDefined
    ) {
      lookBackPeriodDefined = currentTimestamp - redisTimestamp
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
      if (!reportClosed) {
        continue
      }
    }

    if (
      // voting has not started yet
      !proposal.account.votingAt
    ) {
      logger.debug(
        `Proposal '${proposal.account.name}' (${proposal.pubkey.toBase58()}) has not started yet`,
      )
      countVotingNotStartedYet++
      continue
    }

    if (
      // proposal opened in last X seconds
      currentTimestamp - proposal.account.votingAt.toNumber() <=
      lookBackPeriodDefined + toleranceInSeconds
    ) {
      if (!proposal.account.votingCompletedAt) {
        countJustOpenedForVoting++
      }

      const votingSide = getVotingSide(realmData, proposal) // community or council
      const message = `SPL Governance proposal '${proposal.account.name}' opened for ${votingSide} voting`
      await sendNotifications({ message, proposalUrl, proposalVotingAt })
      continue
    }

    // note that these could also include those in finalizing state, but this is just for logging
    if (proposal.account.state === ProposalState.Voting) {
      countOpenForVotingSinceSomeTime++
    }

    const baseVotingTime =
      governancesMap[proposal.account.governance.toBase58()]?.account.config
        .baseVotingTime ?? 0
    const remainingVotingBaseTimeInSeconds =
      baseVotingTime + proposal.account.votingAt.toNumber() - currentTimestamp
    if (
      remainingVotingBaseTimeInSeconds >=
        oneDayInSeconds - toleranceInSeconds &&
      remainingVotingBaseTimeInSeconds <
        oneDayInSeconds + lookBackPeriodDefined + toleranceInSeconds
    ) {
      const votingSide = getVotingSide(realmData, proposal)
      let message = `SPL Governance proposal '${proposal.account.name}' will close for ${votingSide} voting in 24 hrs`
      const votingCoolOffTime =
        governancesMap[proposal.account.governance.toBase58()]?.account.config
          .votingCoolOffTime ?? 0
      if (votingCoolOffTime > 0) {
        message += ` (plus Proposal Cool-off Time ${
          votingCoolOffTime / 3600
        } hours that permits to withdraw votes)`
      }
      await sendNotifications({ message, proposalUrl, proposalVotingAt })
    }
  }

  if (redisClient) {
    await redisClient.set(
      REDIS_KEY,
      (currentTimestamp + toleranceInSeconds).toString(),
    )
  }

  logger.info(
    `countOpenForVotingSinceSomeTime: ${countOpenForVotingSinceSomeTime}, ` +
      `countJustOpenedForVoting: ${countJustOpenedForVoting}, countVotingNotStartedYet: ${countVotingNotStartedYet}, ` +
      `countClosed: ${countClosed}, countCancelled: ${countCancelled}`,
  )
}

function getStateKey(value: number): string | undefined {
  return Object.keys(ProposalState).find(key => ProposalState[value] === key)
}

function getVotingSide(
  realm: ProgramAccount<Realm>,
  proposal: ProgramAccount<Proposal>,
): string {
  return proposal.account.governingTokenMint.equals(realm.account.communityMint)
    ? 'community'
    : 'council'
}

function debugProposal(
  logger: LoggerPlaceholder,
  proposal: ProgramAccount<Proposal>,
) {
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
      : null,
  )
}
