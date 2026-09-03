import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { Order } from 'shippo/models/components';

/**
 * Page dimensions for 4x6 inch label
 * 1 inch = 72 points in PDFKit
 */
const PAGE_WIDTH = 4 * 72; // 288 points
const PAGE_HEIGHT = 6 * 72; // 432 points

/**
 * Layout margins and spacing
 */
const MARGIN = 10;
const LOGO_WIDTH = 36;
const LOGO_HEIGHT = 36;
const LINE_HEIGHT = 14;
const SECTION_LINE_HEIGHT = LINE_HEIGHT * 0.8;
const SECTION_SPACING = 16;

/**
 * Typography settings
 */
const DEFAULT_FONT_SIZE = 8;
const TITLE_EXTRA_SPACING = 6; // Extra space after title to match top margin

/**
 * Logo and address layout
 */
const LOGO_TEXT_VERTICAL_OFFSET = SECTION_LINE_HEIGHT * 0.25; // Lower text relative to logo
const LOGO_TEXT_GAP = SECTION_SPACING / 2; // Horizontal gap between logo and text

/**
 * Order details column layout
 */
const LABEL_VALUE_GAP = 4; // Gap between right-aligned labels and left-aligned values

/**
 * Table styling
 */
const TABLE_HEADER_LINE_WIDTH = 2;
const TABLE_SEPARATOR_LINE_WIDTH = 0.5;
const TABLE_QTY_COLUMN_WIDTH = 30;
const TABLE_COLUMN_GAP = 10; // Gap between items and quantity columns
export const TABLE_ROW_PADDING = 6; // Vertical padding top and bottom of each row

/**
 * Generate a packing slip PDF for a given order
 * @param order - Order object from Shippo API
 * @param outputPath - Path where the PDF should be saved
 */
export async function generatePackingSlip(
  order: Order,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document with 4x6 dimensions
      // font: false skips PDFKit's eager default-font init, which otherwise requires
      // pdfkit's own '#standard-fonts/Helvetica' subpath import — unresolvable once
      // ncc bundles this into a single file with no pdfkit package.json alongside it.
      const doc = new PDFDocument({
        // @ts-expect-error @types/pdfkit@0.17.4 types `font` as string-only; pdfkit@0.20.1 accepts false
        font: false,
        margin: MARGIN,
        size: [PAGE_WIDTH, PAGE_HEIGHT],
      });

      // Register Inter fonts
      doc.registerFont('Inter', path.join(__dirname, 'Inter-Regular.ttf'));
      doc.registerFont('Inter-Bold', path.join(__dirname, 'Inter-Bold.ttf'));

      // Pipe to output file
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Set default font and size for entire document
      doc.font('Inter').fontSize(DEFAULT_FONT_SIZE);

      // Track vertical position
      let y = MARGIN;

      // Render header section
      y = renderHeader(doc, order, y);

      // Render items table
      renderItemsTable(doc, order, y);

      // Finalize PDF
      doc.end();

      stream.on('finish', () => {
        resolve();
      });

      stream.on('error', (error) => {
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to write PDF file'),
        );
      });
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error('Failed to generate PDF'),
      );
    }
  });
}

/**
 * Calculate the height needed to render a line item
 * @param item - Line item to measure
 * @param singleLineHeight - Height of a single line of text
 * @returns Total height needed including padding
 */
export function calculateItemHeight(
  item: NonNullable<Order['lineItems']>[number],
  singleLineHeight: number,
): number {
  let height = TABLE_ROW_PADDING + singleLineHeight; // Top padding + title

  if (item.variantTitle) {
    height += singleLineHeight; // Variant title
  }

  height += TABLE_ROW_PADDING; // Bottom padding

  return height;
}

/**
 * Render the header section of the packing slip
 * @param doc - PDFKit document instance
 * @param order - Order object from Shippo API
 * @param y - Current vertical position
 * @returns New vertical position after rendering
 */
function renderHeader(
  doc: PDFKit.PDFDocument,
  order: Order,
  y: number,
): number {
  // Title
  doc
    .font('Inter-Bold')
    .text(
      `Packing Slip for Order ${order.orderNumber || order.objectId || 'N/A'}`,
      MARGIN,
      y,
      {
        align: 'center',
        width: PAGE_WIDTH - 2 * MARGIN,
      },
    );
  y += LINE_HEIGHT + TITLE_EXTRA_SPACING;

  // Draw a thin line under title (full width)
  doc
    .lineWidth(TABLE_SEPARATOR_LINE_WIDTH)
    .moveTo(0, y)
    .lineTo(PAGE_WIDTH, y)
    .stroke();
  y += SECTION_SPACING / 2;

  // Logo and From Address section - centered horizontally
  const companyName = process.env.COMPANY_NAME;
  if (!companyName) {
    throw new Error('COMPANY_NAME environment variable is required');
  }
  const addressLines = [
    process.env.COMPANY_ADDRESS_LINE_1,
    process.env.COMPANY_ADDRESS_LINE_2,
    process.env.COMPANY_ADDRESS_LINE_3,
  ].filter(Boolean) as string[];

  const logoPath = process.env.COMPANY_LOGO_PATH;
  const hasLogo = !!logoPath && fs.existsSync(logoPath);

  // Measure actual text widths to calculate proper centering
  // Company name is bold; address lines are regular weight — measure each with its own font
  doc.font('Inter-Bold');
  const nameWidth = doc.widthOfString(companyName);
  doc.font('Inter');
  const addressWidths = addressLines.map((l) => doc.widthOfString(l));
  const maxTextWidth = Math.max(nameWidth, ...addressWidths);

  // Calculate total width and center it (only include logo width when present)
  const totalWidth = hasLogo
    ? LOGO_WIDTH + LOGO_TEXT_GAP + maxTextWidth
    : maxTextWidth;
  const startX = (PAGE_WIDTH - totalWidth) / 2;

  if (hasLogo && logoPath) {
    doc.image(logoPath, startX, y, {
      height: LOGO_HEIGHT,
      width: LOGO_WIDTH,
    });
  }

  if (hasLogo) {
    y += LOGO_TEXT_VERTICAL_OFFSET;
  }

  // From Address (to the right of logo, or centered when no logo)
  const fromX = hasLogo ? startX + LOGO_WIDTH + LOGO_TEXT_GAP : startX;
  doc.font('Inter-Bold').text(companyName, fromX, y);
  y += SECTION_LINE_HEIGHT;

  doc.font('Inter');
  for (const line of addressLines) {
    doc.text(line, fromX, y);
    y += SECTION_LINE_HEIGHT;
  }

  // Move past the logo section
  y = Math.max(y + LINE_HEIGHT, MARGIN + LOGO_HEIGHT + SECTION_SPACING);
  y += SECTION_SPACING / 2; // Add vertical space before Ship To section

  // Ship To Address and Order Details on the same row
  const startY = y;
  const midPoint = PAGE_WIDTH / 2;

  // Ship To Address (left side)
  doc.font('Inter-Bold').text('Ship To:', MARGIN, y);
  y += LINE_HEIGHT;

  const address = order.toAddress;
  doc.font('Inter').text(address.name || 'N/A', MARGIN, y);
  y += SECTION_LINE_HEIGHT;

  if (address.company) {
    doc.text(address.company, MARGIN, y);
    y += SECTION_LINE_HEIGHT;
  }

  doc.text(address.street1 || '', MARGIN, y);
  y += SECTION_LINE_HEIGHT;

  if (address.street2) {
    doc.text(address.street2, MARGIN, y);
    y += SECTION_LINE_HEIGHT;
  }

  doc.text(
    `${address.city || ''}, ${address.state || ''} ${address.zip || ''}`,
    MARGIN,
    y,
  );
  y += SECTION_LINE_HEIGHT;

  doc.text(address.country || '', MARGIN, y);
  const shipToEndY = y + LINE_HEIGHT;

  // Order Details (right side, starting at same y as Ship To)
  // Two-column layout: labels right-aligned, values left-aligned
  let orderDetailsY = startY;

  // Measure label widths to determine column positions
  doc.font('Inter-Bold');
  const orderIdLabelWidth = doc.widthOfString('Order ID:');
  const orderDateLabelWidth = doc.widthOfString('Order Date:');
  const totalItemsLabelWidth = doc.widthOfString('Total Items:');
  const maxLabelWidth = Math.max(
    orderIdLabelWidth,
    orderDateLabelWidth,
    totalItemsLabelWidth,
  );

  // Column positions
  const labelColumnEnd = midPoint + maxLabelWidth;
  const valueColumnStart = labelColumnEnd + LABEL_VALUE_GAP;

  // Order ID with right-aligned label and left-aligned value
  doc.font('Inter-Bold').text('Order ID:', midPoint, orderDetailsY, {
    align: 'right',
    width: maxLabelWidth,
  });
  doc
    .font('Inter')
    .text(
      order.orderNumber || order.objectId || 'N/A',
      valueColumnStart,
      orderDetailsY,
    );
  orderDetailsY += LINE_HEIGHT;

  // Order Date with right-aligned label and left-aligned value
  if (order.placedAt) {
    const orderDate = new Date(order.placedAt);
    const formattedDate = orderDate.toLocaleDateString('en-US');
    doc.font('Inter-Bold').text('Order Date:', midPoint, orderDetailsY, {
      align: 'right',
      width: maxLabelWidth,
    });
    doc.font('Inter').text(formattedDate, valueColumnStart, orderDetailsY);
    orderDetailsY += LINE_HEIGHT;
  }

  // Total Items with right-aligned label and left-aligned value
  const totalItems =
    order.lineItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  doc.font('Inter-Bold').text('Total Items:', midPoint, orderDetailsY, {
    align: 'right',
    width: maxLabelWidth,
  });
  doc
    .font('Inter')
    .text(totalItems.toString(), valueColumnStart, orderDetailsY);
  orderDetailsY += LINE_HEIGHT;

  // Move y past whichever section is taller
  y = Math.max(shipToEndY, orderDetailsY) + SECTION_SPACING;

  return y;
}

/**
 * Render the items table section of the packing slip
 * @param doc - PDFKit document instance
 * @param order - Order object from Shippo API
 * @param y - Current vertical position
 * @returns New vertical position after rendering
 */
function renderItemsTable(
  doc: PDFKit.PDFDocument,
  order: Order,
  y: number,
): number {
  const lineItems = order.lineItems || [];

  if (lineItems.length === 0) {
    return y;
  }

  // Table column positions
  const itemsColumnX = MARGIN;
  const qtyColumnX = PAGE_WIDTH - MARGIN - TABLE_QTY_COLUMN_WIDTH;
  const itemsColumnWidth = qtyColumnX - itemsColumnX - TABLE_COLUMN_GAP;

  // Render initial table headers
  y = renderTableHeaders(doc, itemsColumnX, qtyColumnX, y);

  // Render each line item
  doc.font('Inter');

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];

    // Measure the space needed for this item before checking page break
    const title = item.title || 'Unknown Item';
    const singleLineHeight = doc.currentLineHeight();
    const itemHeight = calculateItemHeight(item, singleLineHeight);

    // Check if we need a new page based on actual item height
    const wouldFit = y + itemHeight <= PAGE_HEIGHT - MARGIN;

    if (!wouldFit) {
      doc.addPage({
        margin: MARGIN,
        size: [PAGE_WIDTH, PAGE_HEIGHT],
      });
      y = MARGIN + SECTION_SPACING; // Add section spacing at top of new page
      // Render headers on new page
      y = renderTableHeaders(doc, itemsColumnX, qtyColumnX, y);
    }

    // Add padding at top of row
    y += TABLE_ROW_PADDING;

    const startY = y;

    doc.text(title, itemsColumnX, y, {
      ellipsis: true,
      height: singleLineHeight,
      width: itemsColumnWidth,
    });

    // Quantity (right-aligned, same row as title)
    const quantity = item.quantity || 0;
    doc.text(quantity.toString(), qtyColumnX, startY, {
      align: 'right',
      width: TABLE_QTY_COLUMN_WIDTH,
    });

    y = startY + singleLineHeight;

    // Variant title (if present)
    if (item.variantTitle) {
      doc.font('Inter-Bold').text(item.variantTitle, itemsColumnX, y, {
        ellipsis: true,
        height: singleLineHeight,
        width: itemsColumnWidth,
      });
      doc.font('Inter'); // Reset to regular font

      y += singleLineHeight;
    }

    // Add padding at bottom of row
    y += TABLE_ROW_PADDING;

    // Draw a thin line between items (except after the last item or if next item will be on new page)
    const isLastItem = i === lineItems.length - 1;
    let willNeedNewPage = false;

    if (!isLastItem) {
      // Check if next item will fit on this page
      const nextItem = lineItems[i + 1];
      const nextItemHeight = calculateItemHeight(nextItem, singleLineHeight);
      willNeedNewPage = y + nextItemHeight > PAGE_HEIGHT - MARGIN;
    }

    if (!isLastItem && !willNeedNewPage) {
      doc
        .lineWidth(TABLE_SEPARATOR_LINE_WIDTH)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke();
    }
  }

  return y;
}

/**
 * Render table headers for the items table
 * @param doc - PDFKit document instance
 * @param itemsColumnX - X position for items column
 * @param qtyColumnX - X position for quantity column
 * @param startY - Y position to start rendering
 * @returns New Y position after rendering headers
 */
function renderTableHeaders(
  doc: PDFKit.PDFDocument,
  itemsColumnX: number,
  qtyColumnX: number,
  startY: number,
): number {
  let y = startY;
  doc
    .font('Inter-Bold')
    .text('ITEMS', itemsColumnX, y)
    .text('QTY', qtyColumnX, y, {
      align: 'right',
      width: TABLE_QTY_COLUMN_WIDTH,
    });
  y += LINE_HEIGHT;

  // Draw a thick line under headers (full width)
  doc
    .lineWidth(TABLE_HEADER_LINE_WIDTH)
    .moveTo(0, y)
    .lineTo(PAGE_WIDTH, y)
    .stroke();

  // Reset to regular font for line items
  doc.font('Inter');

  return y;
}
