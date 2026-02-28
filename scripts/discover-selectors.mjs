#!/usr/bin/env node

/**
 * Automated selector discovery for insurance adapters.
 *
 * Uses agent-browser to visit each insurer's quote form start page,
 * take an accessibility tree snapshot, and dump all form fields with
 * their selectors, labels, and structure.
 *
 * Usage:
 *   node scripts/discover-selectors.mjs [adapter-id]
 *
 * Examples:
 *   node scripts/discover-selectors.mjs                    # All adapters
 *   node scripts/discover-selectors.mjs budget-direct-home # Single adapter
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ADAPTERS = [
  { id: 'budget-direct-home', url: 'https://www.budgetdirect.com.au/home-insurance/get-quote.html', type: 'home' },
  { id: 'nrma-home', url: 'https://www.nrma.com.au/home-insurance/get-quote', type: 'home' },
  { id: 'aami-home', url: 'https://www.aami.com.au/home-insurance/get-quote.html', type: 'home' },
  { id: 'allianz-home', url: 'https://www.allianz.com.au/home-insurance/get-quote', type: 'home' },
  { id: 'youi-home', url: 'https://www.youi.com.au/home-insurance/quote', type: 'home' },
  { id: 'budget-direct-motor', url: 'https://www.budgetdirect.com.au/car-insurance/get-quote.html', type: 'motor' },
  { id: 'nrma-motor', url: 'https://www.nrma.com.au/car-insurance/get-quote', type: 'motor' },
  { id: 'aami-motor', url: 'https://www.aami.com.au/car-insurance/get-quote.html', type: 'motor' },
];

const OUTPUT_DIR = join(process.cwd(), 'scripts', 'selector-reports');

// JS to extract all form fields — written here to avoid shell escaping hell
const FORM_FIELDS_JS = `
JSON.stringify(
  Array.from(document.querySelectorAll(
    'input, select, textarea, button[type=submit], [role=combobox], [role=listbox], [role=radio], [role=checkbox]'
  )).map(el => ({
    tag: el.tagName,
    type: el.type || '',
    id: el.id,
    name: el.name || '',
    placeholder: el.placeholder || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    dataTestId: el.getAttribute('data-testid') || '',
    className: el.className.toString().slice(0, 100),
    labels: Array.from(el.labels || []).map(l => l.textContent?.trim()).filter(Boolean),
    visible: el.offsetParent !== null,
    selector: el.id ? '#' + el.id
      : el.name ? el.tagName.toLowerCase() + '[name="' + el.name + '"]'
      : ''
  }))
)
`.replace(/\n/g, ' ').trim();

const NEXT_BUTTONS_JS = `
JSON.stringify(
  Array.from(document.querySelectorAll('button, a[role=button], input[type=submit]'))
    .filter(el => {
      const t = (el.textContent || '').toLowerCase();
      return ['continue', 'next', 'get quote', 'proceed', 'start'].some(w => t.includes(w));
    })
    .map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim()?.slice(0, 50),
      id: el.id,
      type: el.type || '',
      classes: el.className.toString().slice(0, 100),
      selector: el.id ? '#' + el.id : ''
    }))
)
`.replace(/\n/g, ' ').trim();

const STEP_INDICATORS_JS = `
JSON.stringify(
  Array.from(document.querySelectorAll(
    '[class*=step], [class*=progress], [data-step], [role=progressbar], .stepper, .wizard'
  )).map(el => ({
    tag: el.tagName,
    text: el.textContent?.trim()?.slice(0, 100),
    classes: el.className.toString().slice(0, 100)
  }))
)
`.replace(/\n/g, ' ').trim();

function ab(cmd, timeout = 30000) {
  try {
    return execSync(`npx agent-browser ${cmd}`, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString()?.split('\n')[0] || '';
    console.error(`  Command failed: agent-browser ${cmd.slice(0, 60)}...`);
    if (stderr) console.error(`  ${stderr}`);
    return null;
  }
}

function abEval(js) {
  // Write JS to a temp approach — avoids shell quoting issues
  const tmpFile = join(OUTPUT_DIR, '.tmp-eval.js');
  writeFileSync(tmpFile, js);
  return ab(`eval "(() => { ${js} })()"`);
}

async function discoverSelectors(adapter) {
  console.log(`\n--- ${adapter.id} ---`);
  console.log(`URL: ${adapter.url}`);

  // Navigate to the page (agent-browser uses "open", auto-launches browser)
  console.log('  Opening page...');
  const navResult = ab(`open "${adapter.url}"`, 45000);
  if (navResult === null) {
    console.log('  Failed to open page, skipping...');
    return null;
  }

  // Wait for page to settle
  ab('wait 3000');

  // Take a screenshot for reference
  const screenshotPath = join(OUTPUT_DIR, `${adapter.id}-page1.png`);
  ab(`screenshot "${screenshotPath}"`);
  console.log(`  Screenshot: ${screenshotPath}`);

  // Get accessibility tree snapshot (the key output for AI analysis)
  console.log('  Taking accessibility snapshot...');
  const snapshot = ab('snapshot');

  // Get page title
  const pageTitle = ab('get title');

  // Extract form fields via JS eval
  console.log('  Extracting form fields...');
  const formFields = ab(`eval "${FORM_FIELDS_JS.replace(/"/g, '\\"')}"`);

  // Get step indicators
  const stepIndicators = ab(`eval "${STEP_INDICATORS_JS.replace(/"/g, '\\"')}"`);

  // Get next/continue buttons
  const nextButtons = ab(`eval "${NEXT_BUTTONS_JS.replace(/"/g, '\\"')}"`);

  const report = {
    adapterId: adapter.id,
    url: adapter.url,
    type: adapter.type,
    discoveredAt: new Date().toISOString(),
    pageTitle,
    snapshot,
    formFields: safeParseJson(formFields),
    stepIndicators: safeParseJson(stepIndicators),
    nextButtons: safeParseJson(nextButtons),
    screenshotPath,
  };

  return report;
}

function safeParseJson(str) {
  if (!str) return null;
  try {
    // agent-browser eval output may be wrapped in quotes
    const cleaned = str.replace(/^"(.*)"$/s, '$1').replace(/\\"/g, '"').replace(/\\n/g, '\n');
    return JSON.parse(cleaned);
  } catch {
    return str;
  }
}

async function main() {
  const targetId = process.argv[2];
  const targets = targetId
    ? ADAPTERS.filter((a) => a.id === targetId)
    : ADAPTERS;

  if (targets.length === 0) {
    console.error(`Unknown adapter: ${targetId}`);
    console.error(`Available: ${ADAPTERS.map((a) => a.id).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Discovering selectors for ${targets.length} adapter(s)...`);
  console.log('(agent-browser will auto-launch a headless browser)\n');

  const reports = [];
  for (const adapter of targets) {
    const report = await discoverSelectors(adapter);
    if (report) {
      reports.push(report);

      // Save individual report
      const reportPath = join(OUTPUT_DIR, `${adapter.id}.json`);
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`  Report saved: ${reportPath}`);

      // Print summary
      const fields = report.formFields;
      if (Array.isArray(fields)) {
        const visible = fields.filter((f) => f.visible);
        console.log(`  Found ${fields.length} form elements (${visible.length} visible)`);
        for (const f of visible) {
          const label = f.labels?.[0] || f.ariaLabel || f.placeholder || f.name || '(unlabelled)';
          console.log(`    ${f.tag.toLowerCase()}[${f.type}] "${label}" -> ${f.selector || '(no simple selector)'}`);
        }
      }

      const buttons = report.nextButtons;
      if (Array.isArray(buttons) && buttons.length > 0) {
        console.log(`  Next buttons: ${buttons.map((b) => `"${b.text}"`).join(', ')}`);
      }
    }
  }

  // Close browser
  ab('close');

  // Save combined report
  if (reports.length > 1) {
    const combinedPath = join(OUTPUT_DIR, 'all-adapters.json');
    writeFileSync(combinedPath, JSON.stringify(reports, null, 2));
    console.log(`\nCombined report: ${combinedPath}`);
  }

  console.log('\nDone! Review the JSON reports and screenshots in scripts/selector-reports/');
  console.log('Use the form field data to update your adapter selectors.');
}

main().catch(console.error);
