import fs from "fs"
import csv from "csv-parser"
import nodemailer from "nodemailer"
import "dotenv/config"
import validator from "email-validator"
import { verifyEmail, isEmailSafeToSend, logVerificationResult } from "./emailVerifier.js"

console.log('sending mails');

// Validate environment variables
if (!process.env.FROM_ALIASES || !process.env.MAX_PER_RUN) {
  console.error("❌ Missing required environment variables: FROM_ALIASES, MAX_PER_RUN")
  process.exit(1)
}

// Validate Reoon API key
if (!process.env.REOON_API_KEY) {
  console.error("❌ Missing REOON_API_KEY environment variable")
  process.exit(1)
}

const leads = []
const aliases = process.env.FROM_ALIASES.split(",")
const maxPerRun = parseInt(process.env.MAX_PER_RUN)

// Validate maxPerRun
if (isNaN(maxPerRun) || maxPerRun <= 0) {
  console.error("❌ Invalid MAX_PER_RUN value")
  process.exit(1)
}

let sentCount = 0
let failedCount = 0
let aliasIndex = 0
let lastIndex = 0

// Domain cooldown tracking
let domainLastSent = {}
let cooldownQueue = []  // Store contacts waiting for domain cooldown
const DOMAIN_COOLDOWN = 30 * 60 * 1000  // 30 minutes

// Load progress and sent log
let sentLog = {}
let progress = {}
if (fs.existsSync("sent.json")) {
  const data = JSON.parse(fs.readFileSync("sent.json", "utf8"))
  sentLog = data.sentLog || {}
  progress = data.progress || { lastIndex: 0, lastRunDate: "", sentToday: 0 }
  lastIndex = progress.lastIndex || 0
  domainLastSent = data.domainLastSent || {}
  cooldownQueue = data.cooldownQueue || []  // Load cooldown queue on startup
  
  // Check if already ran today
  const today = new Date().toDateString()
  const todayFormatted = new Date().toISOString().split('T')[0]
  
  if (progress.lastRunDate === todayFormatted && progress.sentToday >= maxPerRun) {
    console.log(`🛑 Already sent ${progress.sentToday} emails today. Limit: ${maxPerRun}`)
    console.log("🚫 Script will not run to prevent over-sending")
    process.exit(0)
  }
  
  // Reset daily counter if new day
  if (progress.lastRunDate !== todayFormatted) {
    progress.sentToday = 0
    progress.lastRunDate = todayFormatted
    console.log("🔄 New day detected, daily counter reset")
  }
} else {
  // First run setup
  progress = {
    lastIndex: 0,
    lastRunDate: new Date().toISOString().split('T')[0],
    sentToday: 0
  }
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\n⚠️ Shutting down gracefully...')
  saveProgress()
  console.log('✅ Progress saved')
  process.exit(0)
})

fs.createReadStream("EmailContacts_fixed.csv")
  .pipe(csv())
  .on("data", (row) => leads.push(row))
  .on("error", (error) => {
    console.error("❌ Error reading CSV:", error)
    process.exit(1)
  })
  .on("end", () => {
    if (leads.length === 0) {
      console.error("❌ No leads found in CSV")
      process.exit(1)
    }
    if (!leads[0].email || !leads[0].name || !leads[0].company) {
      console.error("❌ CSV missing required columns: email, name, company")
      process.exit(1)
    }
    sendMails()
  })

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
})

function getNextAlias() {
  const alias = aliases[aliasIndex]
  aliasIndex = (aliasIndex + 1) % aliases.length
  return alias
}

function saveProgress() {
  const data = {
    sentLog: sentLog,
    progress: {
      lastIndex: lastIndex,
      lastRunDate: progress.lastRunDate,
      sentToday: progress.sentToday
    },
    domainLastSent: domainLastSent,
    cooldownQueue: cooldownQueue
  }
  fs.writeFileSync("sent.json", JSON.stringify(data, null, 2))
}

function extractDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
}

function canSendToDomain(email) {
  const domain = extractDomain(email)
  if (!domain) return false
  
  const lastSentTime = domainLastSent[domain]
  if (!lastSentTime) return true
  
  const now = Date.now()
  const timeSinceLastSent = now - lastSentTime
  
  if (timeSinceLastSent < DOMAIN_COOLDOWN) {
    return false
  }
  
  return true
}

function processCooldownQueue() {
  const now = Date.now()
  const readyToSend = []
  const stillOnCooldown = []
  
  cooldownQueue.forEach(item => {
    const domain = extractDomain(item.email)
    const lastSentTime = domainLastSent[domain]
    
    if (!lastSentTime || (now - lastSentTime) >= DOMAIN_COOLDOWN) {
      readyToSend.push(item)
    } else {
      stillOnCooldown.push(item)
    }
  })
  
  cooldownQueue = stillOnCooldown
  return readyToSend
}

async function sendMails() {
  console.log(`📍 Starting from index ${lastIndex} of ${leads.length} contacts`)
  console.log(`📊 Daily limit: ${progress.sentToday}/${maxPerRun}`)
  console.log(`📅 Last run: ${progress.lastRunDate}`)
  console.log(`🌐 Domain cooldown: ${DOMAIN_COOLDOWN/1000/60} minutes`)
  console.log(`⏳ Cooldown queue: ${cooldownQueue.length} contacts waiting`)
  
  while (lastIndex < leads.length || cooldownQueue.length > 0) {
    // Check daily limit first
    if (progress.sentToday >= maxPerRun) {
      console.log("🛑 Daily limit reached:", maxPerRun)
      saveProgress()
      break
    }

    // Get next contact to process
    const readyFromQueue = processCooldownQueue()
    let lead = null
    let isFromQueue = false
    
    if (readyFromQueue.length > 0) {
      lead = readyFromQueue[0]  // Take first from queue
      isFromQueue = true
    } else if (lastIndex < leads.length) {
      lead = leads[lastIndex]
      isFromQueue = false
    } else if (cooldownQueue.length > 0) {
      console.log("⏰ No contacts ready, waiting for cooldowns...")
      await new Promise(r => setTimeout(r, 5 * 60 * 1000))
      continue
    } else {
      break  // All done
    }

    if (sentLog[lead.email]) {
      console.log("⏭ Skipping already sent:", lead.email)
      if (!isFromQueue) lastIndex++  // Only advance if not from queue
      saveProgress()
      continue
    }

    // Validate email format
    if (!validator.validate(lead.email)) {
      console.log("⚠️ Invalid email format:", lead.email)
      if (!isFromQueue) lastIndex++  // Only advance if not from queue
      saveProgress()
      continue
    }

    // Verify email with Reoon API
    console.log("🔍 Verifying email:", lead.email)
    const verificationResult = await verifyEmail(lead.email)
    await logVerificationResult(lead.email, verificationResult)
    
    if (!isEmailSafeToSend(verificationResult)) {
      console.log(`🚫 Email not safe to send (${verificationResult.status}):`, lead.email)
      // Mark as sent to avoid re-verification
      sentLog[lead.email] = `VERIFICATION_FAILED_${verificationResult.status}`
      if (!isFromQueue) lastIndex++  // Only advance if not from queue
      saveProgress()
      continue
    }

    console.log("✅ Verified and now sending:", lead.email)

    // Check domain cooldown
    if (!canSendToDomain(lead.email)) {
      console.log("⏸️ Adding to cooldown queue:", lead.email)
      if (!isFromQueue) {
        cooldownQueue.push({...lead, _fromQueue: true})
        lastIndex++  // Advance to next lead in CSV
      }
      saveProgress()
      continue
    }

    const alias = getNextAlias()
    const mailOptions = {
      from: `Saket <${alias}>`,
      replyTo: alias,
      to: lead.email,
      subject: `Hi, Quick question about ${lead.company}`,
      html: `
        <p>Hi ${lead.name},</p>
        <p>I came across <b>${lead.company}</b> and was genuinely impressed </p>
        <p>I'm a software engineer currently exploring opportunities. Would you be open to a brief chat about potential fits on your team?</p>
        <p>Happy to share my background if it's helpful.</p>
        <br/>
        <p>Best,<br/>Saket</p>
        <p style="font-size:11px;color:gray">Not interested? Just reply "stop"</p>
      `
    }

    try {
      await transporter.sendMail(mailOptions)
      sentCount++
      progress.sentToday++
      sentLog[lead.email] = new Date().toISOString()
      
      // Update domain cooldown
      const domain = extractDomain(lead.email)
      domainLastSent[domain] = Date.now()
      
      if (!isFromQueue) lastIndex++  // Only advance if not from queue
      saveProgress()
      console.log(`✅ Sent (${sentCount}) → ${lead.email} [${isFromQueue ? 'Queue' : 'Index: ' + (lastIndex-1)}] via ${alias}`)
      console.log(`📊 Daily: ${progress.sentToday}/${maxPerRun}`)
      console.log(`🌐 Domain ${domain} cooldown activated`)
      console.log(`⏳ Cooldown queue: ${cooldownQueue.length} contacts waiting`)
    } catch (err) {
      failedCount++
      console.log("❌ Failed:", lead.email, err.message)
      
      // Mark invalid emails to skip in future
      if (err.message.includes('550') || err.message.includes('NoSuchUser') || err.message.includes('does not exist') || err.message.includes('Relaying denied')) {
        console.log("🚫 Invalid/unreachable email detected:", lead.email)
        sentLog[lead.email] = 'INVALID_EMAIL'
      }
      
      if (!isFromQueue) lastIndex++  // Only advance if not from queue
      saveProgress()
      
      // Log error to file for debugging
      const errorLog = `${new Date().toISOString()} - Failed to send to ${lead.email}: ${err.message}\n`
      fs.appendFileSync("error.log", errorLog)
    }

    // Delay between emails (2-5 minutes)
    await new Promise(r => setTimeout(r, 120000 + Math.random() * 180000))
  }
  
  if (lastIndex >= leads.length && cooldownQueue.length === 0) {
    console.log("🎉 All contacts processed!")
    console.log(`📊 Final stats: Sent: ${sentCount}, Failed: ${failedCount}`)
    console.log("🔄 Resetting to start again from beginning...")
    lastIndex = 0
    progress.sentToday = 0
    domainLastSent = {}
    cooldownQueue = []
    saveProgress()
  }
}
