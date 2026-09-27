/**
 * Environment variable validation script for CI and `prebuild`.
 * Validates .env.example documentation and the configured contract addresses.
 *
 * This is the single contract verification script: it resolves the active
 * address per network in the same order as config/contractAddress.ts and
 * fails when none is configured or a configured one is malformed.
 *
 * Usage: node scripts/validate-env.js
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation failed
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

let hasErrors = false;
let hasWarnings = false;

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  hasErrors = true;
  log(`❌ ERROR: ${message}`, colors.red);
}

function warning(message) {
  hasWarnings = true;
  log(`⚠️  WARNING: ${message}`, colors.yellow);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Required environment variables that must be documented
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET',
  'NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET',
  'CRON_SECRET',
];

// Optional but recommended environment variables
const OPTIONAL_ENV_VARS = [
  'NEXT_PUBLIC_CONTRACT_ADDRESS',
  'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
  'NEXT_PUBLIC_PLAUSIBLE_DOMAIN',
  'NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET',
  'NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET',
];

// Soroban contract address validation (C + 55 base32 chars = 56 total)
const CONTRACT_ADDRESS_REGEX = /^C[A-Z2-7]{55}$/;

function isValidContractAddress(address) {
  if (typeof address !== 'string' || address.length !== 56) {
    return false;
  }
  return CONTRACT_ADDRESS_REGEX.test(address);
}

function validateEnvExample() {
  log('\n' + '='.repeat(70), colors.bold);
  log('Environment Variable Validation', colors.bold);
  log('='.repeat(70) + '\n', colors.bold);

  const envExamplePath = path.join(rootDir, '.env.example');

  // Check if .env.example exists
  if (!fs.existsSync(envExamplePath)) {
    error('.env.example file not found');
    info('Create .env.example to document required environment variables');
    return;
  }

  success('.env.example file exists');

  // Read .env.example
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  const documentedVars = new Set();

  // Parse documented variables
  envExampleContent.split('\n').forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      documentedVars.add(match[1]);
    }
  });

  log('\n📋 Checking required environment variables...\n');

  // Check required variables are documented
  REQUIRED_ENV_VARS.forEach((varName) => {
    if (documentedVars.has(varName)) {
      success(`${varName} is documented`);
    } else {
      error(`${varName} is not documented in .env.example`);
    }
  });

  log('\n📋 Checking optional environment variables...\n');

  // Check optional variables
  OPTIONAL_ENV_VARS.forEach((varName) => {
    if (documentedVars.has(varName)) {
      success(`${varName} is documented`);
    } else {
      info(`${varName} could be documented (optional)`);
    }
  });

  // Validate contract address format examples in .env.example
  log('\n🔍 Validating contract address format examples...\n');

  const lines = envExampleContent.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^(NEXT_PUBLIC_CONTRACT_ADDRESS[^=]*)=(.+)$/);
    if (match) {
      const varName = match[1];
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      
      // Skip empty values (which is fine for examples)
      if (!value) {
        info(`${varName} has no example value (line ${index + 1})`);
        return;
      }

      // If a value is provided, it should be valid
      if (!isValidContractAddress(value)) {
        error(
          `${varName} has invalid example contract address format (line ${index + 1}): ${value}`
        );
        info('Contract addresses must be 56 characters: C followed by 55 base32 chars (A-Z, 2-7)');
      } else {
        success(`${varName} has valid example format (line ${index + 1})`);
      }
    }
  });
}

function validateContractConfig() {
  log('\n' + '='.repeat(70), colors.bold);
  log('Contract Configuration Validation', colors.bold);
  log('='.repeat(70) + '\n', colors.bold);

  const contractsConfigPath = path.join(rootDir, 'config', 'contractAddress.ts');

  if (!fs.existsSync(contractsConfigPath)) {
    error('config/contractAddress.ts not found');
    return;
  }

  success('config/contractAddress.ts exists');

  const content = fs.readFileSync(contractsConfigPath, 'utf8');

  // Check for validation function
  if (content.includes('isValidContractAddress')) {
    success('Contract address validation function exists');
  } else {
    warning('No contract address validation function found in contractAddress.ts');
  }

  // Check for regex validation
  if (content.includes('CONTRACT_ADDRESS_REGEX')) {
    success('Contract address regex pattern defined');
  } else {
    warning('No contract address regex pattern found');
  }

  // Check for proper environment variable loading
  const envVarChecks = [
    'NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET',
    'NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET',
  ];

  log('\n🔍 Checking environment variable references...\n');

  envVarChecks.forEach((varName) => {
    if (content.includes(varName)) {
      success(`${varName} is referenced in contractAddress.ts`);
    } else {
      warning(`${varName} is not referenced in contractAddress.ts`);
    }
  });
}

/** Reads .env files the way Next.js does; real environment variables win. */
function loadEnv() {
  const fileVars = {};
  ['.env', '.env.production', '.env.local', '.env.production.local'].forEach((file) => {
    const envPath = path.join(rootDir, file);
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
        if (match) fileVars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      });
  });
  return { ...fileVars, ...process.env };
}

function validateConfiguredContractAddresses() {
  log('\n' + '='.repeat(70), colors.bold);
  log('Active Contract Address Validation', colors.bold);
  log('='.repeat(70) + '\n', colors.bold);

  const env = loadEnv();
  const legacy = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  let configured = 0;

  ['mainnet', 'testnet'].forEach((network) => {
    const varName = `NEXT_PUBLIC_CONTRACT_ADDRESS_${network.toUpperCase()}`;
    const source = env[varName] ? varName : legacy ? 'NEXT_PUBLIC_CONTRACT_ADDRESS' : null;
    const address = source ? env[source].trim() : '';

    if (!address) {
      warning(`${network}: no contract address configured (set ${varName})`);
      return;
    }
    if (!isValidContractAddress(address)) {
      error(`${network}: ${source} is malformed: ${address}`);
      info('Contract addresses must be 56 characters: C followed by 55 base32 chars (A-Z, 2-7)');
      return;
    }
    if (address.startsWith('CAAAAAAA')) {
      error(`${network}: ${source} is the placeholder address, not a deployed contract`);
      return;
    }
    configured++;
    success(`${network}: ${address} (from ${source})`);
  });

  if (configured === 0) {
    error(
      'No contract address configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET and/or NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET.',
    );
  }
}

function validateREADME() {
  log('\n' + '='.repeat(70), colors.bold);
  log('README Documentation Validation', colors.bold);
  log('='.repeat(70) + '\n', colors.bold);

  const readmePath = path.join(rootDir, 'README.md');

  if (!fs.existsSync(readmePath)) {
    warning('README.md not found');
    return;
  }

  const content = fs.readFileSync(readmePath, 'utf8');

  // Check if environment variables section exists
  if (content.includes('Environment variables') || content.includes('⚙️ Configuration')) {
    success('Environment variables section found in README');
  } else {
    warning('No environment variables section found in README');
  }

  // Check if contract addresses are documented
  const varsToDocument = [
    'NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET',
    'NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET',
  ];

  log('\n📋 Checking environment variable documentation...\n');

  varsToDocument.forEach((varName) => {
    if (content.includes(varName)) {
      success(`${varName} is documented in README`);
    } else {
      warning(`${varName} is not documented in README`);
    }
  });

  // Check for contract address format documentation
  if (content.match(/56.*char/i) || content.includes('C...')) {
    success('Contract address format is documented');
  } else {
    info('Consider documenting the contract address format (56 chars, C-prefix)');
  }
}

// Main execution
function main() {
  log('\n🚀 Starting environment variable validation...\n', colors.bold);

  validateEnvExample();
  validateContractConfig();
  validateConfiguredContractAddresses();
  validateREADME();

  // Summary
  log('\n' + '='.repeat(70), colors.bold);
  log('Validation Summary', colors.bold);
  log('='.repeat(70) + '\n', colors.bold);

  if (hasErrors) {
    error('Validation failed with errors');
    log('\n💡 Please fix the errors above and try again.\n', colors.yellow);
    process.exit(1);
  } else if (hasWarnings) {
    warning('Validation passed with warnings');
    log('\n💡 Consider addressing the warnings above.\n', colors.yellow);
    process.exit(0);
  } else {
    success('All validations passed!');
    log('\n✨ Environment configuration is properly documented.\n', colors.green);
    process.exit(0);
  }
}

main();
