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

Notify about stuff via webhook calls, implemented to notify on new SPL Gov proposals

Options:
  -V, --version                                output the version number
  -u, --url <url-or-moniker>                   URL of Solana cluster or moniker (m/mainnet/mainnet-beta, d/devnet, t/testnet) (default: "m")
  --commitment <commitment>                    Solana RPC client connection commitment (default: "confirmed")
  -d, --debug                                  Debug (default: false)
  -c, --notification-config <config...>        Additional webhook configurations.Every "notification-type" has got different variadic arguments to pass in.
                                               webhook expects url [<url>], i.e., --notification-type webhook -c http://some/url
                                               telegram expects token [<token> <chatId>], i.e., --notification-type telegram -c 'abcdef:123' '-123456789'
                                               discord expects webhook url [<webhookUrl>], i.e., --notification-type discord -c 'https://discord.com/api/webhooks/123-channel-id/bot-idFsOSHkGHVM'
  -n, --notification-type <notification-type>  Notification type (choices: "webhook", "telegram", "discord", "none", default: "none")
  -r, --redis <redis-url>                      Redis URL (example: redis://localhost:6379). When provided then the notifier uses redis to store its last run to not loosing any notifications.
  -h, --help                                   display help for command

Commands:
  proposals [options]                          Verify existence of governance proposals in last time period
  help [command]                               display help for command
```