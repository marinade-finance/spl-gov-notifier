# SPL Governance notifier bot CLI

A notification bot that checks on-chain data from a realm
and notifies via webhook about newly created proposals

The code was based on idea from governance ui
[scripts](https://github.com/solana-labs/governance-ui/blob/4d75b2368cefb9d314e381a968c983995ba329e2/scripts/governance-notifier.ts).

## How to run

```bash
git clone https://github.com/marinade-finance/spl-gov-notifier
cd spl-gov-notifier

pnpm install
pnm cli --help

Usage: index [options] [command]

Notify about Solana SPL Governance newly created proposals via webhook calls

Options:
  -V, --version                         output the version number
  -u, --url <url-or-moniker>            URL of Solana cluster or moniker (m/mainnet/mainnet-beta, d/devnet, t/testnet) (default: "mainnet-beta")
  --commitment <commitment>             Solana RPC client connection commitment (default: "confirmed")
  -d, --debug                           Debug (default: false)
  -v, --verbose                         alias for --debug (default: false)
  -r, --redis <redis-url>               Redis URL (e.g., redis://localhost:6379). If provided, the notifier uses Redis to store its last run, preventing the loss of any notifications.
  --webhook                             Enable webhook notifications
  --telegram                            Enable Telegram notifications
  --discord                             Enable Discord notifications
  --slack                               Enable Slack notifications
  --webhook-url <url>                   Webhook URL for webhook notifications (env: WEBHOOK_URL)
  --telegram-token <token>              Bot token for Telegram notifications (env: TELEGRAM_TOKEN)
  --telegram-chat-id <chatId>           Chat ID for Telegram notifications (env: TELEGRAM_CHAT_ID)
  --discord-url <url>                   Webhook URL for Discord notifications (env: DISCORD_WEBHOOK_URL)
  --discord-notification-color <color>  Color for Slack notifications in decimal format (default: aero blue) (default: "13238245")
  --slack-token <token>                 Bearer token for Slack notifications (env: SLACK_BEARER_TOKEN)
  --slack-feed <feedName>               Feed name for Slack notifications (env: SLACK_FEED)
  --slack-notification-color <color>    Color for Slack notifications in hex format (default: aero blue) (default: "#c9ffe5")
  --bot-name <botName>                  Name of bot that will be announced in notification (default: "SPL Governance Notifier")
  -h, --help                            display help for command

Commands:
  proposals [options]                   Verify existence of newly created governance proposals in last time period
  help [command]                        display help for command

```

To list all proposals for default MNDE realm without any notification to be sent

```bash
# default RPC may not be able to list the proposal data
export RPC_URL='https://api.mainnet-beta.solana.com'
pnpm cli proposals -u $RPC_URL -v
```

## Testing

For testing purposes one may try to use webhook type on localhost

### 1. Start mock HTTP replier

```sh
socat -v TCP-LISTEN:8000,crlf,reuseaddr,fork SYSTEM:"echo HTTP/1.0 200; echo Content-Type\: text/plain; echo; echo OK"
```

### 2. Notify on closed proposals

* Run the notify pointing to the locally started mocked HTTP replier
* Use option `--report-closed` to notify about closed proposals (by default only opened are reported)
* Prolong the `--time-to-check` for example for 3 months to list all opened+closed proposals during that time.

```sh
pnpm cli proposals -u $RPC_URL --report-closed --time-to-check 7889231 \
  --webhook --webhook-url http://0.0.0.0:8000
```