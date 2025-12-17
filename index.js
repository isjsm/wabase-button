#!/usr/bin/env node

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import chalk from 'chalk'
import figlet from 'figlet'
import dotenv from 'dotenv'
import { handler } from './src/handler.js'

dotenv.config({ debug: false })

/* ===============================
   FILTER NOISE (Bad MAC, Signal)
================================ */
const originalError = console.error
const originalLog = console.log
const originalStdoutWrite = process.stdout.write

const FILTER_PATTERNS = [
  'Bad MAC',
  'Failed to decrypt message',
  'Session error',
  'Closing open session',
  'Signal',
  'registrationId',
  'currentRatchet',
  'chainKey',
  'messageKeys',
]

process.stdout.write = function (chunk, encoding, callback) {
  const str = chunk?.toString() || ''
  if (FILTER_PATTERNS.some(p => str.includes(p))) {
    if (typeof callback === 'function') callback()
    return true
  }
  return originalStdoutWrite.call(this, chunk, encoding, callback)
}

console.error = function (...args) {
  const msg = args.join(' ')
  if (FILTER_PATTERNS.some(p => msg.includes(p))) return
  originalError.apply(console, args)
}

console.log = function (...args) {
  const msg = args.join(' ')
  if (FILTER_PATTERNS.some(p => msg.includes(p))) return
  originalLog.apply(console, args)
}

/* ===============================
   BANNER
================================ */
function centerText(text) {
  const width = process.stdout.columns || 80
  return text
    .split('\n')
    .map(line => ' '.repeat(Math.max(0, (width - line.length) / 2)) + line)
    .join('\n')
}

function showBanner() {
  console.clear()
  const banner = figlet.textSync('Wabase Bot', { font: 'Slant' })
  console.log(chalk.cyanBright(centerText(banner)))
  console.log(chalk.greenBright(centerText('Interactive WhatsApp Bot')))
  console.log(chalk.gray(centerText('────────────────────────────')) + '\n')
}

/* ===============================
   BOT START
================================ */
const authDir = path.join(process.cwd(), 'session')

async function startBot() {
  showBanner()

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  /* ===== CONNECTION ===== */
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      console.log(chalk.greenBright('✅ Connected to WhatsApp'))
      console.log(chalk.cyan('👤 User:'), sock.user?.id)
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode

      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.red('❌ Logged out. Delete session folder and restart.'))
        process.exit(1)
      }

      console.log(chalk.yellow('🔁 Connection closed. Waiting for auto reconnect...'))
      // ❌ لا تعيد startBot()
    }
  })

  sock.ev.on('creds.update', saveCreds)

  /* ===== MESSAGE HANDLER ===== */
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0]
    if (!msg || msg.key.fromMe) return

    try {
      await handler(sock, msg)
    } catch (err) {
      console.error(chalk.red('[Handler Error]'), err)
    }
  })

  /* ===== PAIRING CODE ===== */
  if (!fs.existsSync(authDir) || fs.readdirSync(authDir).length === 0) {
    const { waNumber } = await inquirer.prompt([
      {
        type: 'input',
        name: 'waNumber',
        message: chalk.cyan('📱 Enter WhatsApp number (without +):'),
        validate: v => /^\d{8,}$/.test(v) || 'Invalid number',
      },
    ])

    const code = await sock.requestPairingCode(waNumber)
    console.log(chalk.greenBright('\n✅ Pairing Code:'))
    console.log(chalk.magentaBright(code))
    console.log(chalk.gray('\nWhatsApp → Linked Devices → Link a Device\n'))
  }
}

startBot()