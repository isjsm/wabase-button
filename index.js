#!/usr/bin/env node
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'

import pino from 'pino'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import figlet from 'figlet'
import dotenv from 'dotenv'
import inquirer from 'inquirer'
import { fileURLToPath } from 'url'
import { handler } from './src/handler.js'

dotenv.config()

/* ===================== */
/* Utils                 */
/* ===================== */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SESSION_DIR = path.join(__dirname, 'session')

function showBanner() {
  console.clear()
  const banner = figlet.textSync('Wabase Button', { font: 'Slant' })
  console.log(chalk.cyan(banner))
  console.log(chalk.gray('────────────────────────────────────'))
  console.log(chalk.green(' WhatsApp Multi-Device Button Bot '))
  console.log(chalk.gray('────────────────────────────────────\n'))
}

/* ===================== */
/* Main                  */
/* ===================== */
async function startBot() {
  showBanner()

  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR)

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Wabase', 'Chrome', '1.0.0']
  })

  /* ===================== */
  /* Connection Updates    */
  /* ===================== */
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'connecting') {
      console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
    }

    if (connection === 'open') {
      console.log(chalk.green('✅ Connected to WhatsApp'))
      console.log(chalk.cyan(`👤 User: ${sock.user?.id}`))

      if (!state.creds.registered) {
        const { number } = await inquirer.prompt([
          {
            type: 'input',
            name: 'number',
            message: '📱 Enter WhatsApp number (without +):',
            validate: n => /^\d{8,}$/.test(n) || 'Invalid number'
          }
        ])

        const cleanNumber = number.replace(/\D/g, '')
        const code = await sock.requestPairingCode(cleanNumber)

        console.log('\n' + chalk.green('🔗 Pairing Code:'))
        console.log(chalk.bold.yellow(code))
        console.log(chalk.gray('\nOpen WhatsApp → Linked Devices → Link a Device\n'))
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      const reconnect = reason !== DisconnectReason.loggedOut

      console.log(
        chalk.red('❌ Connection closed'),
        reconnect ? chalk.yellow('— Reconnecting...') : ''
      )

      if (reconnect) {
        setTimeout(startBot, 3000)
      } else {
        console.log(chalk.red('🧹 Session expired. Delete session folder and restart.'))
      }
    }
  })

  /* ===================== */
  /* Messages              */
  /* ===================== */
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg || msg.key.fromMe) return

    try {
      await handler(sock, msg)
    } catch (err) {
      console.error(chalk.red('[Handler Error]'), err)
    }
  })

  sock.ev.on('creds.update', saveCreds)
}

startBot()