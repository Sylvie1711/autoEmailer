import dns from 'dns'
import net from 'net'
import { promisify } from 'util'
import crypto from 'crypto'

const resolveMx = promisify(dns.resolveMx)

/**
 * Improved SMTP Email Verifier with Heuristic-Based Validation
 * Uses confidence scoring instead of strict catch-all detection
 * 
 * @param {string} email - Email to verify
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} Reoon-compatible verification result
 */
export async function verifyEmail(email, options = {}) {
  const debug = options.debug || false
  const skipCatchAll = options.skipCatchAll || false // Option to skip catch-all test
  
  const result = {
    email: email,
    status: 'unknown',
    reason: '',
    is_catch_all: false,
    is_disposable: false,
    is_free_email: false,
    is_role_account: false,
    mx_records: [],
    smtp_check: false,
    dns_check: false,
    confidence_score: 0,
    risk_level: 'unknown' // low, medium, high
  }

  try {
    // Basic format check
    if (!isValidFormat(email)) {
      result.status = 'invalid'
      result.reason = 'Invalid email format'
      result.confidence_score = 0
      return result
    }

    const [localPart, domain] = email.split('@')
    const domainLower = domain.toLowerCase()

    // Check if role-based email (info@, admin@, support@, etc.)
    result.is_role_account = isRoleAccount(localPart)

    // Check if disposable domain
    result.is_disposable = isDisposableDomain(domainLower)
    if (result.is_disposable) {
      result.status = 'invalid'
      result.reason = 'Disposable email address'
      result.confidence_score = 0
      result.risk_level = 'high'
      return result
    }

    // Check if free email provider
    result.is_free_email = isFreeEmailProvider(domainLower)

    // DNS/MX Check
    const mxRecords = await resolveMx(domainLower).catch(() => null)
    if (!mxRecords || mxRecords.length === 0) {
      result.status = 'invalid'
      result.reason = 'No MX records found'
      result.dns_check = false
      result.confidence_score = 0
      result.risk_level = 'high'
      return result
    }

    result.dns_check = true
    result.mx_records = mxRecords
      .sort((a, b) => a.priority - b.priority)
      .map(mx => mx.exchange)

    // Detect corporate email infrastructure
    const mailProvider = detectMailProvider(result.mx_records)
    if (debug) console.log(`[DEBUG] Mail provider detected: ${mailProvider}`)

    // SMTP verification
    const mxHost = result.mx_records[0]
    if (debug) console.log(`[DEBUG] Testing ${email} on ${mxHost}`)
    
    const realEmailCheck = await testSMTPConnection(email, mxHost)
    if (debug) console.log(`[DEBUG] Real email SMTP result:`, realEmailCheck)

    if (!realEmailCheck.connected) {
      result.status = 'unknown'
      result.reason = 'Could not connect to mail server'
      result.confidence_score = 50
      result.risk_level = 'medium'
      return result
    }

    result.smtp_check = true

    // If real email is explicitly rejected, mark as invalid
    if (!realEmailCheck.accepted) {
      result.status = 'invalid'
      result.reason = realEmailCheck.reason || 'Email does not exist'
      result.confidence_score = 10
      result.risk_level = 'high'
      return result
    }

    // Real email was accepted - now decide based on mail provider
    // For corporate providers (Google Workspace, O365), skip catch-all test
    if (skipCatchAll || mailProvider === 'google_workspace' || mailProvider === 'microsoft365' || mailProvider === 'corporate') {
      if (debug) console.log(`[DEBUG] Skipping catch-all test for ${mailProvider}`)
      
      // Use heuristic scoring instead
      const confidence = calculateHeuristicConfidence(email, result, mailProvider)
      result.confidence_score = confidence
      
      if (confidence >= 75) {
        result.status = 'valid'
        result.reason = 'Email accepted by mail server'
        result.risk_level = 'low'
      } else if (confidence >= 50) {
        result.status = 'valid'
        result.reason = 'Likely valid (corporate mail server)'
        result.risk_level = 'medium'
      } else {
        result.status = 'unknown'
        result.reason = 'Cannot verify definitively'
        result.risk_level = 'medium'
      }
      
      return result
    }

    // For other providers, perform catch-all test
    if (debug) console.log(`[DEBUG] Performing catch-all test...`)
    
    const randomTests = []
    const numTests = 2
    
    for (let i = 0; i < numTests; i++) {
      const randomEmail = generateRandomEmail(domainLower)
      if (debug) console.log(`[DEBUG] Testing random email ${i+1}: ${randomEmail}`)
      const randomCheck = await testSMTPConnection(randomEmail, mxHost)
      if (debug) console.log(`[DEBUG] Random email ${i+1} result:`, randomCheck)
      randomTests.push(randomCheck)
      
      if (i < numTests - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    const acceptedCount = randomTests.filter(test => test.accepted).length
    if (debug) console.log(`[DEBUG] Random emails accepted: ${acceptedCount}/${numTests}`)
    
    // If ALL random emails accepted, it's catch-all
    if (acceptedCount === numTests) {
      result.is_catch_all = true
      result.status = 'catch_all'
      result.reason = 'Domain accepts all emails (catch-all)'
      result.confidence_score = 60
      result.risk_level = 'medium'
      return result
    }

    // If some rejected, consider valid
    result.status = 'valid'
    result.reason = 'Email verified successfully'
    result.confidence_score = 90
    result.risk_level = 'low'
    return result

  } catch (error) {
    result.status = 'unknown'
    result.reason = `Verification error: ${error.message}`
    result.confidence_score = 50
    result.risk_level = 'medium'
    return result
  }
}

/**
 * Detect mail provider from MX records
 */
function detectMailProvider(mxRecords) {
  const mxString = mxRecords.join(' ').toLowerCase()
  
  if (mxString.includes('google') || mxString.includes('googlemail')) {
    return 'google_workspace'
  }
  if (mxString.includes('outlook') || mxString.includes('microsoft') || mxString.includes('office365')) {
    return 'microsoft365'
  }
  if (mxString.includes('zoho')) {
    return 'zoho'
  }
  if (mxString.includes('protonmail')) {
    return 'protonmail'
  }
  
  // Check for common consumer providers
  if (mxString.includes('gmail') || mxString.includes('yahoo') || mxString.includes('hotmail')) {
    return 'consumer'
  }
  
  return 'corporate' // Assume corporate email if unknown
}

/**
 * Calculate confidence score based on heuristics
 */
function calculateHeuristicConfidence(email, result, mailProvider) {
  let score = 0
  
  // Base score for SMTP acceptance
  if (result.smtp_check) score += 40
  
  // DNS check
  if (result.dns_check) score += 20
  
  // Mail provider reputation
  if (mailProvider === 'google_workspace' || mailProvider === 'microsoft365') {
    score += 20 // Major providers = higher confidence
  } else if (mailProvider === 'corporate') {
    score += 15
  }
  
  // Email structure
  const localPart = email.split('@')[0]
  
  // Penalize role accounts
  if (result.is_role_account) {
    score -= 10
  }
  
  // Penalize very short or suspicious local parts
  if (localPart.length < 3) {
    score -= 10
  }
  
  // Penalize strings of random characters
  if (/^[a-z0-9]{20,}$/.test(localPart)) {
    score -= 15
  }
  
  // Reward proper name formats
  if (/^[a-z]+\.[a-z]+$/.test(localPart) || /^[a-z]+$/.test(localPart)) {
    score += 10
  }
  
  // Free email provider
  if (result.is_free_email) {
    score -= 5 // Slightly lower confidence for free emails
  }
  
  return Math.max(0, Math.min(100, score))
}

/**
 * Test SMTP connection for a single email
 */
function testSMTPConnection(email, mxHost) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost)
    let response = ''
    let step = 0
    let lastResponseCode = ''

    const commands = [
      `HELO verify.example.com\r\n`,
      `MAIL FROM:<verify@example.com>\r\n`,
      `RCPT TO:<${email}>\r\n`,
      `QUIT\r\n`
    ]

    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({
        connected: false,
        accepted: false,
        reason: 'Connection timeout'
      })
    }, 15000)

    socket.on('data', (data) => {
      response += data.toString()
      const lines = response.split('\r\n')
      const lastLine = lines[lines.length - 2] || ''
      
      const match = lastLine.match(/^(\d{3})/)
      if (match) {
        lastResponseCode = match[1]
      }

      if (/^[23]\d{2}/.test(lastLine)) {
        if (step < 3) {
          socket.write(commands[step])

          if (step === 2) {
            clearTimeout(timeout)
            socket.write(commands[3])
            socket.end()

            if (/^250/.test(lastLine)) {
              // Check for rejection phrases even in 250 responses
              const lowerLine = lastLine.toLowerCase()
              if (lowerLine.includes('user unknown') || 
                  lowerLine.includes('does not exist') ||
                  lowerLine.includes('no such user') ||
                  lowerLine.includes('invalid recipient') ||
                  lowerLine.includes('recipient rejected')) {
                resolve({
                  connected: true,
                  accepted: false,
                  reason: 'User does not exist',
                  code: lastResponseCode
                })
              } else {
                resolve({
                  connected: true,
                  accepted: true,
                  reason: 'Email accepted',
                  code: lastResponseCode
                })
              }
            } else if (/^550|^551|^553|^554/.test(lastLine)) {
              resolve({
                connected: true,
                accepted: false,
                reason: 'User does not exist',
                code: lastResponseCode
              })
            } else if (/^450|^451|^452/.test(lastLine)) {
              resolve({
                connected: true,
                accepted: false,
                reason: 'Temporary error - greylisting',
                code: lastResponseCode
              })
            } else if (/^[45]\d{2}/.test(lastLine)) {
              resolve({
                connected: true,
                accepted: false,
                reason: 'Email rejected',
                code: lastResponseCode
              })
            } else {
              resolve({
                connected: true,
                accepted: false,
                reason: 'Unknown response',
                code: lastResponseCode
              })
            }
            return
          }

          step++
        }
      } else if (/^[45]\d{2}/.test(lastLine)) {
        clearTimeout(timeout)
        socket.destroy()
        resolve({
          connected: false,
          accepted: false,
          reason: 'SMTP error: ' + lastLine,
          code: lastResponseCode
        })
      }
    })

    socket.on('error', (error) => {
      clearTimeout(timeout)
      resolve({
        connected: false,
        accepted: false,
        reason: error.message
      })
    })

    socket.on('timeout', () => {
      clearTimeout(timeout)
      socket.destroy()
      resolve({
        connected: false,
        accepted: false,
        reason: 'Socket timeout'
      })
    })
  })
}

/**
 * Generate random email for catch-all testing
 */
function generateRandomEmail(domain) {
  const randomString = crypto.randomBytes(16).toString('hex')
  return `${randomString}@${domain}`
}

/**
 * Check if email local part is a role account
 */
function isRoleAccount(localPart) {
  const roleAccounts = [
    'info', 'admin', 'support', 'sales', 'contact', 'help', 'service',
    'office', 'hello', 'team', 'mail', 'webmaster', 'postmaster', 'noreply',
    'no-reply', 'jobs', 'careers', 'hr', 'marketing', 'billing', 'accounts'
  ]
  return roleAccounts.includes(localPart.toLowerCase())
}

/**
 * Basic email format validation
 */
function isValidFormat(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

/**
 * Check if domain is disposable
 */
function isDisposableDomain(domain) {
  const disposableDomains = [
    'tempmail.com', 'guerrillamail.com', '10minutemail.com', 
    'mailinator.com', 'throwaway.email', 'temp-mail.org',
    'maildrop.cc', 'sharklasers.com', 'yopmail.com',
    'trashmail.com', 'fakeinbox.com', 'getnada.com'
  ]
  return disposableDomains.includes(domain)
}

/**
 * Check if domain is a free email provider
 */
function isFreeEmailProvider(domain) {
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
    'zoho.com', 'yandex.com', 'gmx.com', 'live.com'
  ]
  return freeProviders.includes(domain)
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const testEmails = [
    'harshk@elementsgs.com',
    'bgl@astortech.com',
    'sunilk@asmltd.com',
    'dharmik@atlan.com',
    'test@netrixllc.com'
  ]

  console.log('🔍 Starting improved email verification...\n')

  for (const email of testEmails) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Verifying: ${email}`)
    console.log('='.repeat(60))
    const result = await verifyEmail(email, { debug: true })
    console.log('\n📊 Final Result:')
    console.log(`Status: ${result.status}`)
    console.log(`Confidence: ${result.confidence_score}%`)
    console.log(`Risk Level: ${result.risk_level}`)
    console.log(`Is Catch-All: ${result.is_catch_all}`)
    console.log(`Reason: ${result.reason}`)
  }
}