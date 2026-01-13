# EmailerBot - Advanced Email Verification & Sending System

A sophisticated email marketing automation system with intelligent email verification, domain cooldown management, and comprehensive tracking.

## 🚀 Features

### Email Verification
- **Reoon API Integration** - Professional email verification service
- **Custom SMTP Verifier** - Advanced catch-all detection with Google Workspace handling
- **Heuristic-based Validation** - Confidence scoring and risk assessment
- **Disposable Email Detection** - Blocks temporary email services
- **Role Account Identification** - Identifies info@, admin@, support@ accounts

### Email Sending
- **Domain Cooldown System** - Prevents spam by limiting sends per domain
- **Queue Management** - Intelligent cooldown queue processing
- **Daily Sending Limits** - Configurable daily send quotas
- **Alias Rotation** - Multiple sender aliases for better deliverability
- **Progress Tracking** - Comprehensive sent email logging

### Data Management
- **CSV Processing** - Bulk email list processing
- **Progress Persistence** - Resume sending after interruptions
- **Error Handling** - Graceful error recovery and logging
- **Verification Logging** - Detailed verification result tracking

## 📁 Project Structure

```
EmailerBot/
├── mailer.js              # Main email sending system
├── emailVerifier.js       # Reoon API integration
├── smtpVerifier.js        # Custom SMTP verification
├── smtp-verifier-heuristic.js # Heuristic-based verifier
├── testReoon.js          # Reoon API testing
├── quickTest.js          # Quick verification tests
├── syncSent.js           # Progress synchronization
├── fixcsv.js             # CSV processing utilities
├── sent.json             # Progress tracking
├── EmailContacts.csv     # Email list
├── package.json          # Dependencies
├── .env                  # Environment variables
└── README.md             # This file
```

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd EmailerBot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .envsample .env
   # Edit .env with your configuration
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Email Configuration
FROM_ALIASES="alias1@domain.com,alias2@domain.com"
MAX_PER_RUN=50

# Reoon API (for professional verification)
REOON_API_KEY=your_reoon_api_key_here

# SMTP Configuration (for sending)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Required Variables

- `FROM_ALIASES`: Comma-separated list of sender email addresses
- `MAX_PER_RUN`: Maximum emails to send per run
- `REOON_API_KEY`: Your Reoon API key for email verification

## 🚀 Usage

### Basic Email Sending

```bash
node mailer.js
```

### Email Verification Testing

```bash
# Test with Reoon API
node testReoon.js

# Quick verification tests
node quickTest.js

# Test specific email
node testPiyush.js
```

### CSV Processing

```bash
# Fix CSV formatting
node fixcsv.js

# Synchronize progress
node syncSent.js
```

## 📊 Email Verification Methods

### 1. Reoon API Integration
- **Professional-grade verification**
- **Quick mode** (0.5s) - Syntax, MX, domain checks
- **Power mode** (5-60s) - Deep inbox verification
- **Catch-all detection**
- **Disposable email identification**

### 2. Custom SMTP Verifier
- **Advanced catch-all detection**
- **Google Workspace special handling**
- **Random email testing**
- **Confidence scoring**
- **Detailed SMTP response analysis**

### 3. Heuristic-Based Validation
- **Mail provider detection**
- **Risk level assessment**
- **Email structure analysis**
- **Role account identification**
- **Confidence scoring algorithm**

## 🎯 Verification Results

### Status Types
- **valid** - Email exists and can receive emails
- **invalid** - Email does not exist or has issues
- **catch_all** - Domain accepts all emails
- **disposable** - Temporary email service
- **unknown** - Verification failed

### Confidence Scoring
- **90-100%** - High confidence valid emails
- **70-89%** - Likely valid emails
- **50-69%** - Medium confidence
- **<50%** - Low confidence or invalid

### Risk Levels
- **low** - Safe to send
- **medium** - Use with caution
- **high** - Avoid sending

## 📈 Performance Features

### Domain Cooldown System
- Prevents overwhelming email servers
- Configurable cooldown periods
- Intelligent queue management
- Automatic queue processing

### Progress Tracking
- Resumable sending sessions
- Detailed sent email logs
- Verification result caching
- Error recovery mechanisms

### Rate Limiting
- Daily sending limits
- Per-domain throttling
- Configurable delays
- Graceful degradation

## 🔧 Advanced Configuration

### Custom SMTP Verifier Options

```javascript
const options = {
  debug: true,           // Enable debug logging
  skipCatchAll: false    // Skip catch-all testing
}

const result = await verifyEmail(email, options)
```

### Domain-Specific Handling

The system includes special handling for:
- **Google Workspace** - Conservative catch-all detection
- **Microsoft 365** - Corporate email handling
- **Consumer providers** - Standard verification
- **Corporate domains** - Enhanced validation

## 📝 Logging and Monitoring

### Verification Logs
- Detailed verification results
- SMTP response codes
- Confidence scores
- Risk assessments

### Sending Logs
- Sent email tracking
- Domain cooldown status
- Error logging
- Progress metrics

## 🚨 Error Handling

### Common Issues
1. **Missing API keys** - Check environment variables
2. **SMTP connection failures** - Verify SMTP credentials
3. **Domain cooldown** - Wait for cooldown period
4. **CSV formatting** - Use fixcsv.js utility

### Debug Mode
Enable debug logging for detailed troubleshooting:

```javascript
const result = await verifyEmail(email, { debug: true })
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🔗 Dependencies

- **nodemailer** - Email sending
- **csv-parser** - CSV processing
- **email-validator** - Email format validation
- **dotenv** - Environment variable management
- **dns** - DNS/MX record lookup
- **net** - SMTP connections

## 📞 Support

For issues and questions:
1. Check the logs for error details
2. Verify environment variables
3. Test with the provided test scripts
4. Review the documentation

---

**Last Updated**: January 2026
**Version**: 1.0.0
