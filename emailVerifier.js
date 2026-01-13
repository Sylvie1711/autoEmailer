import "dotenv/config"

// Reoon API email verifier
export async function verifyEmail(email) {
  const apiKey = process.env.REOON_API_KEY
  
  if (!apiKey) {
    console.error("❌ REOON_API_KEY not found in environment variables")
    return { status: 'error', message: 'API key missing' }
  }

  try {
    const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    console.log(`🔍 Email verification for ${email}: ${data.status}`)
    
    return data
  } catch (error) {
    console.error(`❌ Email verification failed for ${email}:`, error.message)
    return { status: 'error', message: error.message }
  }
}

// Check if email is safe to send to
export function isEmailSafeToSend(verificationResult) {
  if (!verificationResult || verificationResult.status === 'error') {
    return false
  }
  
  // Power mode statuses: "safe", "invalid", "disabled", "disposable", 
  // "inbox_full", "catch_all", "role_account", "spamtrap", "unknown"
  // Only send to safe emails
  const safeStatuses = ['safe']
  
  return safeStatuses.includes(verificationResult.status)
}

// Log verification results for debugging
export async function logVerificationResult(email, result) {
  const logEntry = {
    email: email,
    status: result.status,
    timestamp: new Date().toISOString(),
    details: {
      is_valid_syntax: result.is_valid_syntax,
      is_disposable: result.is_disposable,
      is_spamtrap: result.is_spamtrap,
      mx_accepts_mail: result.mx_accepts_mail
    }
  }
  
  // Append to verification log file
  const fs = await import('fs')
  const logLine = JSON.stringify(logEntry) + '\n'
  fs.appendFileSync('verification.log', logLine)
  
  return logEntry
}
