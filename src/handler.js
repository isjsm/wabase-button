import { userState } from './userState.js'
import { handleCallButton } from './features/callButton.js'
import { handleUrlButton } from './features/urlButton.js'
import { handleQuickReplyButton } from './features/quickReplyButton.js'
import { handleCopyButton } from './features/copyButton.js'

// ================================
// Anti-Duplicate System
// ================================
const processed = new Set()

export async function handler(sock, msg) {
  if (!msg?.message) return

  const msgId = msg.key?.id
  if (!msgId) return

  // منع التكرار
  if (processed.has(msgId)) return
  processed.add(msgId)

  setTimeout(() => processed.delete(msgId), 60_000)

  const from = msg.key.remoteJid
  const state = userState.get(from) || { step: 'start' }

  let actionId = null

  try {
    // Native Flow (Interactive List)
    if (
      msg.message?.interactiveResponseMessage
        ?.nativeFlowResponseMessage?.paramsJson
    ) {
      const parsed = JSON.parse(
        msg.message.interactiveResponseMessage
          .nativeFlowResponseMessage.paramsJson
      )
      actionId = parsed.id
    }

    // Normal List
    else if (
      msg.message?.listResponseMessage
        ?.singleSelectReply?.selectedRowId
    ) {
      actionId =
        msg.message.listResponseMessage.singleSelectReply.selectedRowId
    }

    // Old Buttons
    else if (
      msg.message?.buttonsResponseMessage?.selectedButtonId
    ) {
      actionId =
        msg.message.buttonsResponseMessage.selectedButtonId
    }
  } catch (err) {
    console.error('❌ Parse error:', err)
  }

  // ================================
  // Handle Actions
  // ================================
  if (actionId) {
    switch (actionId) {
      case 'call':
        await handleCallButton(sock, from)
        break

      case 'url':
        await handleUrlButton(sock, from)
        break

      case 'quick':
        await handleQuickReplyButton(sock, from)
        break

      case 'copy':
        await handleCopyButton(sock, from)
        break
    }
    return
  }

  // ================================
  // Initial Menu
  // ================================
  if (state.step === 'start' || state.step === 'menuMain') {
    await sendIntroMenu(sock, from)
    userState.set(from, { step: 'menuMain' })
  }
}

// ================================
// Menu Sender
// ================================
async function sendIntroMenu(sock, from) {
  await sock.sendMessage(from, {
    text: '🤖 Hello!\nChoose an option from the menu below:',
    footer: '© Atex Ovi 2025 — MIT License',
    interactiveButtons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: 'Menu',
          sections: [
            {
              title: 'Available Features',
              rows: [
                { title: 'Call Button', description: 'Example: Call Button', id: 'call' },
                { title: 'URL Button', description: 'Example: URL Button', id: 'url' },
                { title: 'Quick Reply Button', description: 'Example: Quick Reply Button', id: 'quick' },
                { title: 'Copy Button', description: 'Example: Copy Button', id: 'copy' }
              ]
            }
          ]
        })
      }
    ]
  })
}