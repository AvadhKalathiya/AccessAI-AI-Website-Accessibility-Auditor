import type { RemediationResult, StoredViolationContext } from "./types";

/**
 * Rule-specific remediation templates for common axe-core rules.
 * Grounded in WCAG 2.1 / 2.2 specifications and axe-core rule documentation.
 */
interface RuleHandler {
  (finding: StoredViolationContext): Omit<
    RemediationResult,
    "provider" | "model" | "timestamp" | "source"
  >;
}

const RULE_HANDLERS: Record<string, RuleHandler> = {
  "image-alt": (f) => ({
    explanation:
      "All <img> elements must have an 'alt' attribute to provide equivalent information to screen reader users and when images fail to load.",
    whyItMatters:
      "People who are blind or have low vision rely on screen readers to vocalize the purpose of visual content. Without alternative text, users hear only the filename or nothing at all.",
    userImpact:
      "Screen reader users cannot understand the meaning or context of the image.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag111"],
    recommendedFix:
      "Inspect the image to determine whether it is informative or decorative. If informative, provide a concise, descriptive 'alt' attribute explaining its content. If purely decorative, supply an empty alt attribute (alt=\"\").",
    codeBefore: f.htmlSnippet.trim() || "<img src=\"example.jpg\">",
    codeAfter: f.htmlSnippet
      ? f.htmlSnippet.includes("<img") && !f.htmlSnippet.includes("alt=")
        ? f.htmlSnippet.replace(/<img\b/, "<img alt=\"Descriptive image summary\"")
        : f.htmlSnippet
      : "<img src=\"example.jpg\" alt=\"Descriptive text or empty string if decorative\">",
    codeExplanation:
      "Added the 'alt' attribute. Replace 'Descriptive image summary' with text accurately conveying the image purpose, or use alt=\"\" if decorative.",
    testingSteps: [
      "Inspect the element in browser DevTools to verify the 'alt' attribute is present.",
      "Navigate to the image using a screen reader (e.g. NVDA, VoiceOver) and verify the description is spoken correctly.",
      "Verify decorative images with alt=\"\" are skipped cleanly by assistive technology.",
    ],
    limitations:
      "AccessAI cannot determine whether this image is informative or decorative from markup alone without human judgment of the visual design and context.",
  }),

  label: (f) => ({
    explanation:
      "Form controls must have an accessible name or associated <label> element so users understand what data is requested.",
    whyItMatters:
      "Without labels, users navigating with speech recognition or screen readers cannot reliably determine the purpose of input fields.",
    userImpact:
      "Screen reader users encounter unannounced inputs (e.g., 'Edit text, blank'), increasing the risk of form submission errors.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag131", "wcag412"],
    recommendedFix:
      "Associate a visible <label> with the form input using matching 'for' and 'id' attributes, or wrap the input inside the <label>. For standalone search or icon inputs, provide an 'aria-label' attribute.",
    codeBefore: f.htmlSnippet.trim() || "<input type=\"text\" name=\"search\">",
    codeAfter:
      "<label for=\"user-input\">Field Name</label>\n<input id=\"user-input\" type=\"text\" name=\"user-input\">",
    codeExplanation:
      "Connected an explicit <label> to the input via matching 'for' and 'id' attributes. Alternatively, use aria-label=\"Field Name\" if a visible label is visually omitted.",
    testingSteps: [
      "Click the visible text label in the browser and confirm focus moves to the input control.",
      "Check the Accessibility tree in browser DevTools to confirm the 'Accessible Name' is computed properly.",
      "Test with a screen reader and confirm the label is vocalized when focusing the input.",
    ],
    limitations:
      "Ensure the chosen label matches the visible text and clear visual context of the overall form.",
  }),

  "button-name": (f) => ({
    explanation:
      "Buttons must have discernible, accessible text so users understand the action triggered when clicking or pressing.",
    whyItMatters:
      "Icon-only buttons or buttons lacking text content cannot be identified by speech-input users or screen readers.",
    userImpact:
      "Screen reader users hear only 'button' without knowing what action it performs (such as Submit, Close, or Delete).",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag412"],
    recommendedFix:
      "Add visible text content inside the <button> element, or add an 'aria-label' attribute explaining the action for icon-only buttons.",
    codeBefore: f.htmlSnippet.trim() || "<button><svg>...</svg></button>",
    codeAfter: f.htmlSnippet
      ? f.htmlSnippet.includes("<button") && !f.htmlSnippet.includes("aria-label=")
        ? f.htmlSnippet.replace(/<button\b/, "<button aria-label=\"Action description\"")
        : f.htmlSnippet
      : "<button type=\"button\" aria-label=\"Action description\"><svg>...</svg></button>",
    codeExplanation:
      "Added an 'aria-label' attribute providing an accessible name for the button. Replace with a concise verb phrase like 'Close dialog' or 'Search'.",
    testingSteps: [
      "Inspect the button in browser DevTools and check the Computed Properties / Accessibility Tree for 'name'.",
      "Verify that keyboard focus lands on the button and screen reader vocalizes the action name.",
    ],
    limitations:
      "If the button contains an SVG or icon, ensure the icon is hidden from assistive technology using aria-hidden=\"true\" to avoid duplicate announcements.",
  }),

  "link-name": (f) => ({
    explanation:
      "Links must have discernible text that clearly explains the destination or purpose of the link.",
    whyItMatters:
      "Screen reader users frequently navigate by generating a list of links on the page. Generic link text like 'click here' or empty links convey no destination context.",
    userImpact:
      "Users navigating links out of context cannot identify where the link leads.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag244", "wcag412"],
    recommendedFix:
      "Provide meaningful text inside the <a> tag, or use an 'aria-label' attribute if the link contains only an icon or image.",
    codeBefore: f.htmlSnippet.trim() || "<a href=\"/docs\"><svg>...</svg></a>",
    codeAfter:
      "<a href=\"/docs\" aria-label=\"Documentation overview\"><svg aria-hidden=\"true\">...</svg> Read Documentation</a>",
    codeExplanation:
      "Added descriptive text and aria-label so the destination is immediately clear when read in or out of context.",
    testingSteps: [
      "Open the link list in a screen reader (e.g. Insert+F7 in NVDA) and verify the destination makes sense in isolation.",
      "Confirm keyboard focus indicator is visible and accessible text is spoken.",
    ],
    limitations:
      "Avoid repeating 'link to' or 'click here' inside link text as screen readers already announce the element as a link.",
  }),

  "html-has-lang": (f) => ({
    explanation:
      "The root <html> element must have a valid 'lang' attribute declaring the primary natural language of the document.",
    whyItMatters:
      "Screen readers and speech synthesizers use the document language to select the correct pronunciation rules, accent, and inflection.",
    userImpact:
      "Assistive technology may pronounce text using the wrong language rules, resulting in unintelligible speech.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag311"],
    recommendedFix:
      "Add a valid BCP 47 language code attribute to the root <html> tag, such as lang=\"en\" or lang=\"es\".",
    codeBefore: "<html>",
    codeAfter: "<html lang=\"en\">",
    codeExplanation:
      "Declared 'en' (English) as the default language. Change to the appropriate BCP 47 code (e.g. 'fr', 'de', 'es') for your content.",
    testingSteps: [
      "Inspect the <html> tag in DevTools and verify the 'lang' attribute is present and valid.",
      "Validate the language code against the IANA Language Subtag Registry.",
    ],
    limitations:
      "Ensure any embedded passages in different languages on the same page have their own lang attributes (e.g. <span lang=\"es\">).",
  }),

  "document-title": (f) => ({
    explanation:
      "Each document must have a descriptive, non-empty <title> element inside the <head> section.",
    whyItMatters:
      "The page title is the first item announced by screen readers when loading a page, and it identifies the page in browser tabs, bookmarks, and search results.",
    userImpact:
      "Users navigating between tabs or windows cannot orient themselves or confirm whether a page transition occurred.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag242"],
    recommendedFix:
      "Add a unique, descriptive <title> element within the HTML <head> indicating both page content and site identity.",
    codeBefore: "<head>\n  <!-- Missing <title> -->\n</head>",
    codeAfter: "<head>\n  <title>Page Description — AccessAI</title>\n</head>",
    codeExplanation:
      "Added a descriptive <title> tag following the standard format: '[Page Topic] — [Site Name]'.",
    testingSteps: [
      "Check browser tab title in DevTools or browser window header.",
      "Verify a screen reader announces the title immediately upon page load.",
    ],
    limitations:
      "Ensure dynamic single-page applications update document.title on client-side route changes.",
  }),

  "color-contrast": (f) => ({
    explanation:
      "Text and images of text must have sufficient color contrast against their background (at least 4.5:1 for regular text, 3:1 for large text).",
    whyItMatters:
      "People with low vision, color blindness, or age-related vision changes cannot read text with low contrast, especially under bright ambient lighting.",
    userImpact:
      "Low contrast renders text difficult or impossible to decipher for millions of users.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag143"],
    recommendedFix:
      "Adjust the foreground text color or the background color until the contrast ratio meets or exceeds 4.5:1 (or 3:1 for text ≥18pt or bold ≥14pt).",
    codeBefore: f.htmlSnippet.trim() || "<p style=\"color: #999; background: #fff;\">Light text</p>",
    codeAfter:
      "/* Update CSS styling to achieve >= 4.5:1 contrast */\n.accessible-text {\n  color: #595959; /* or darker */\n  background-color: #ffffff;\n}",
    codeExplanation:
      "Darkened foreground color or lightened background color to ensure compliance with WCAG Level AA contrast ratios.",
    testingSteps: [
      "Use Chrome DevTools color picker to inspect the computed contrast ratio for the element.",
      "Verify the contrast ratio exceeds 4.5:1 for standard body copy.",
    ],
    limitations:
      "AccessAI cannot determine computed CSS colors defined in external stylesheets or background gradients from snippet alone without live browser rendering inspection.",
  }),

  "aria-roles": (f) => ({
    explanation:
      "All WAI-ARIA 'role' attribute values must be valid and recognized ARIA role definitions.",
    whyItMatters:
      "Invalid or misspelled ARIA roles are ignored by assistive technology or may trigger unexpected accessibility tree malfunctions.",
    userImpact:
      "Screen readers may fail to announce the element's interactive type or capabilities properly.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag412"],
    recommendedFix:
      "Review the element's role attribute and replace it with a valid WAI-ARIA role (such as 'button', 'dialog', 'navigation', 'alert'), or use standard semantic HTML elements instead.",
    codeBefore: f.htmlSnippet.trim() || "<div role=\"incorrect-role\">...</div>",
    codeAfter:
      "<!-- Prefer native semantic HTML: -->\n<nav>...</nav>\n<!-- Or use a valid ARIA role: -->\n<div role=\"navigation\">...</div>",
    codeExplanation:
      "Replaced invalid role with native HTML element or valid WAI-ARIA 1.2 specification role.",
    testingSteps: [
      "Verify the element in browser DevTools Accessibility Tree to confirm the role is recognized.",
      "Test with a screen reader to confirm the element role is announced as intended.",
    ],
    limitations:
      "First rule of ARIA: If you can use a native HTML5 element (e.g. <nav>, <button>, <header>) instead of an ARIA role, always prefer native HTML.",
  }),

  "aria-required-attr": (f) => ({
    explanation:
      "Elements with specific ARIA roles must provide all required ARIA attributes defined by the WAI-ARIA specification.",
    whyItMatters:
      "Complex widget roles (e.g. role='slider', role='checkbox', role='combobox') require state attributes to convey current values and status to assistive technology.",
    userImpact:
      "Assistive tech users cannot determine the current state, value, or range of the control.",
    wcagCriteria: f.wcagTags.length > 0 ? f.wcagTags : ["wcag412"],
    recommendedFix:
      "Add the missing required ARIA attributes specified in the axe-core failure summary (e.g. aria-valuenow, aria-valuemin, aria-valuemax for sliders).",
    codeBefore: f.htmlSnippet.trim() || "<div role=\"slider\"></div>",
    codeAfter:
      "<div role=\"slider\"\n     tabindex=\"0\"\n     aria-valuenow=\"50\"\n     aria-valuemin=\"0\"\n     aria-valuemax=\"100\"\n     aria-label=\"Volume\"></div>",
    codeExplanation:
      "Added all mandatory ARIA attributes (aria-valuenow, aria-valuemin, aria-valuemax, aria-label) required for the slider role.",
    testingSteps: [
      "Check the Accessibility Inspector in DevTools to confirm all required attributes are computed.",
      "Test keyboard arrow key adjustments and ensure screen reader announces updated values.",
    ],
    limitations:
      "Ensure JavaScript event listeners are implemented to keep ARIA state attributes in sync when the user interacts with the widget.",
  }),
};

/**
 * Generates a deterministic, rule-based remediation result without requiring
 * an external LLM service.
 */
export function generateDeterministicFallback(
  finding: StoredViolationContext
): RemediationResult {
  const handler = RULE_HANDLERS[finding.ruleId];

  let guidance: Omit<
    RemediationResult,
    "provider" | "model" | "timestamp" | "source"
  >;

  if (handler) {
    guidance = handler(finding);
  } else {
    // Generic fallback based on stored axe-core help metadata
    guidance = {
      explanation:
        finding.helpText ||
        finding.description ||
        `Accessibility violation detected for rule '${finding.ruleId}'.`,
      whyItMatters:
        "Accessibility compliance ensures web content is perceivable, operable, understandable, and robust for all users.",
      userImpact: `Users with disabilities may experience barriers when encountering elements failing the '${finding.ruleId}' rule (${finding.impact} impact).`,
      wcagCriteria: finding.wcagTags.length > 0 ? finding.wcagTags : ["wcag412"],
      recommendedFix: `Review the axe-core recommendation: ${finding.helpText}. Refer to official guidelines at ${finding.helpUrl || "https://dequeuniversity.com/rules/axe"}.`,
      codeBefore: finding.htmlSnippet.trim() || null,
      codeAfter: null,
      codeExplanation:
        "Code fix requires specific page context. Review the element markup and apply appropriate accessibility patterns.",
      testingSteps: [
        "Inspect the affected element in browser DevTools.",
        "Check the Axe failure summary: " + (finding.failureSummary || "Review element attributes"),
        "Verify fixes with automated re-scan and manual assistive technology testing.",
      ],
      limitations:
        "Rule-specific deterministic guidance is not yet customized for this rule ID. Refer to the axe-core help URL for authoritative guidance.",
    };
  }

  return {
    ...guidance,
    provider: "deterministic-rule-engine",
    model: null,
    timestamp: new Date().toISOString(),
    source: "fallback",
  };
}
