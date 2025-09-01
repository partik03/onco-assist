// ---------- Helpers ----------
function absUrl(href) {
  if (!href) return null;
  try { return new URL(href, location.href).href; } catch { return href; }
}

// ---------- Top-level fields ----------

// Name in the header
const drug_name = $('[data-qa=drug-price-header-title]').text().trim() || null;

// Try to get generic name from header "(...)" first, else fall back to description
let drug_generic_name = null;
const headerText = $('[data-qa=drug-price-header-title]').text();
const headerMatch = headerText && headerText.match(/\(([^)]+)\)/);
if (headerMatch) {
  drug_generic_name = headerMatch[1].trim();
} else {
  const descriptionText = $('[data-qa=drug-description-content]').text();
  const descMatch = descriptionText && descriptionText.match(/\(([^)]+)\)/);
  drug_generic_name = descMatch ? descMatch[1].trim() : null;
}

// Prices
const lowest_price = $('span.font-header-s').first().text().trim() || null;
const original_price_text =
  $('span.font-body-meta-strikethrough.mt-1.text-secondary').first().text().trim() || null;

// Update date (strip the prefix if present)
let price_update_date = $('[data-qa=pricing-timestamp]').text().trim() || null;
if (price_update_date) {
  price_update_date = price_update_date.replace(
    /^GoodRx coupon prices last updated on\s*/i,
    ''
  ).trim();
}

// Description
const drug_description = $('[data-qa=drug-description-content]').text().trim() || null;

// Manufacturer (best-effort; falls back to null)
const manufacturer =
  $('a[href*="/manufacturer/"]').first().text().trim() ||
  $('[data-qa*="manufacturer"]').first().text().trim() ||
  null;

// Drug class (best-effort; remove “Other ” prefix if that’s how the page renders it)
let drug_class =
  $('[data-qa="section-header"]:contains("Class")').next().text().trim() ||
  $('[data-qa=section-header]').first().text().trim() || null;
if (drug_class) drug_class = drug_class.replace(/^Other\s+/i, '').trim();

// ---------- Pharmacies ----------
const pharmacies = $('li[data-qa^="price-rows-row"]')
  .map(function () {
    const $row = $(this);

    const pharmacy_name =
      $row.find('.pharmacy-row-pharmacy-name-meta').first().text().trim() ||
      $row.find('span.font-body-medium').first().text().trim() ||
      null;

    const pharmacy_price =
      $row.find('.pharmacy-row-price-number').first().text().trim() ||
      $row.find('.pharmacy-row-price').first().text().trim() ||
      $row.find('span.font-header-s').first().text().trim() ||
      null;

    const origEl = $row.find('span.font-body-meta-strikethrough.mt-1.text-secondary').first();
    const pharmacy_original_price = origEl.length ? origEl.text().trim() : null;

    const logo_src = $row.find('img').first().attr('src');
    const pharmacy_logo = absUrl(logo_src);

    // Only include rows that have at least a name or a price
    if (!pharmacy_name && !pharmacy_price) return null;

    return {
      pharmacy_name,
      pharmacy_price,
      pharmacy_original_price,
      pharmacy_logo,
    };
  })
  .get();

// ---------- Related drugs ----------
const related_drugs = $('[data-qa=related-drugs] a')
  .map(function () {
    const href = $(this).attr('href');
    return {
      related_drug_name: $(this).find('span.font-body-large-medium').text().trim() || null,
      related_drug_url: absUrl(href),
    };
  })
  .get();

// ---------- Related conditions ----------
const related_conditions = $('[data-qa=related-conditions] a')
  .map(function () {
    const href = $(this).attr('href');
    return {
      condition_name: $(this).find('span.font-body-large-medium').text().trim() || null,
      condition_url: absUrl(href),
    };
  })
  .get();

// ---------- Related articles ----------
const related_articles = $('a[data-qa=ArticleCard]')
  .map(function () {
    const href = $(this).attr('href');
    const img = $(this).find('img').attr('src');
    return {
      article_title: $(this).find('h3.mb-3').text().trim() || null,
      article_url: absUrl(href),
      article_author: $(this)
        .find('span.text-secondary.font-body-meta-regular')
        .text()
        .replace(/^\s*Written By\s*/i, '')
        .trim() || null,
      article_image: absUrl(img),
    };
  })
  .get();

// Coupon present?
const coupon_available = $('[data-qa=pn-primary-placement]').length > 0;

// Savings program text (best-effort)
const savings_program = $('p.font-body-meta-regular').first().text().trim() || null;

// ---------- Return ----------
return {
  drug_name,
  drug_generic_name,
  lowest_price,
  original_price: original_price_text,
  price_update_date,
  drug_description,
  manufacturer,
  drug_class,
  pharmacies,
  related_drugs,
  related_conditions,
  related_articles,
  coupon_available,
  savings_program,
};
