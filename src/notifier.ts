import { NotificationType, useContext } from './context'
import axios from 'axios'

export const TELEGRAM_BOT_URL = 'https://api.telegram.org/bot'

export async function notify(message: string) {
  const { notification, logger } = useContext()
  logger.info('notify:', message)

  switch (notification.type) {
    case NotificationType.TELEGRAM: {
      const url = `${TELEGRAM_BOT_URL}${notification.botToken}/sendMessage`
      const options = {
        headers: {
          'Content-Type': 'application/json',
        },
      }
      const payload = {
        chat_id: notification.chatId,
        text: message,
        disable_notification: true,
      }
      await axios.post(url, payload, options)
      break
    }
    case NotificationType.WEBHOOK: {
      await axios.post(notification.url, { message })
      break
    }
    default:
      return
  }
}
