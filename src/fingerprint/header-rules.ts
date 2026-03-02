/**
 * Manages declarativeNetRequest dynamic rules to spoof the User-Agent
 * HTTP header and remove Client Hints headers during quote runs.
 */

const UA_RULE_ID = 9001;
const CH_RULE_ID = 9002;

/** Apply User-Agent header spoofing rules for the duration of a quote run. */
export async function applyUAHeaderRules(ua: string): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [UA_RULE_ID, CH_RULE_ID],
    addRules: [
      {
        id: UA_RULE_ID,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: 'User-Agent', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: ua },
          ],
        },
        condition: {
          urlFilter: '*',
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          ],
        },
      },
      {
        id: CH_RULE_ID,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: 'Sec-CH-UA', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
            { header: 'Sec-CH-UA-Platform', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
            { header: 'Sec-CH-UA-Mobile', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
          ],
        },
        condition: {
          urlFilter: '*',
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          ],
        },
      },
    ],
  });
}

/** Remove all fingerprint header rules (called when a quote run completes). */
export async function clearUAHeaderRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [UA_RULE_ID, CH_RULE_ID],
    addRules: [],
  });
}
