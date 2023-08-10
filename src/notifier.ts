import { NotificationType, useContext } from './context'
import axios from 'axios'

export const TELEGRAM_BOT_URL = 'https://api.telegram.org/bot'

export async function notify(message: string) {
  const { notification, logger } = useContext()
  logger.info('notify: %s', message)

  let axiosResponse
  switch (notification.type) {
    case NotificationType.TELEGRAM: {
      const url = `${TELEGRAM_BOT_URL}${notification.botToken}/sendMessage`
      const headers = {
        'Content-Type': 'application/json',
      }
      const payload = {
        chat_id: notification.chatId,
        text: message,
        disable_notification: true,
      }
      logger.debug(
        'sending telegram notification to "%s" with payload "%s"',
        url,
        JSON.stringify(payload)
      )
      axiosResponse = await axios.post(url, payload, { headers })
      break
    }
    case NotificationType.WEBHOOK: {
      axiosResponse = await axios.post(notification.url, { message })
      logger.debug(
        'sending webhook notification to "%s" with message "%s"',
        notification.url,
        message
      )

      break
    }
    default:
      return
  }
  if (axiosResponse.status !== 200) {
    logger.error(
      'failed to send notification %s; axios status: %s, data: %s',
      notification,
      axiosResponse.status,
      JSON.stringify(axiosResponse.data)
    )
  }
}
