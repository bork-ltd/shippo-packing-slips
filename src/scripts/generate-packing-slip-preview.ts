import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

import { generatePackingSlip } from '../services/pdf-generator';
import { fetchOrders } from '../services/shippo';

// Load environment variables (.env.local overrides .env)
dotenv.config();
dotenv.config({ override: true, path: '.env.local' });

/**
 * Dev tool: fetch real orders from Shippo and render packing slip PDFs for
 * them, without printing or sending Slack notifications. Use this to visually
 * verify layout changes against real order data (long titles, real
 * variant naming, multi-item orders) before shipping them.
 *
 * Usage: yarn preview:packing-slips [--days=N] [--limit=N]
 */
async function main() {
  const apiToken = process.env.SHIPPO_API_TOKEN;
  if (!apiToken) {
    console.error('Error: SHIPPO_API_TOKEN not found in environment');
    process.exit(2);
  }
  if (!process.env.COMPANY_NAME) {
    console.error('Error: COMPANY_NAME not found in environment');
    process.exit(2);
  }

  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? 'true'];
    }),
  );
  const daysBack = parseInt(args.get('days') ?? '30', 10);
  const limit = parseInt(args.get('limit') ?? '10', 10);

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  console.log(`Fetching orders from the last ${daysBack} day(s)...`);
  console.log('  Start:', startDate.toISOString());
  console.log('  End:  ', endDate.toISOString());
  console.log('');

  // No status filter — real payload variety (draft, cancelled, etc.) is
  // useful for a layout preview, unlike the production job which only
  // prints PAID orders.
  const orders = await fetchOrders(startDate, endDate);

  if (orders.length === 0) {
    console.log('No orders found in that range. Try a larger --days value.');
    return;
  }

  const selected = orders.slice(0, limit);
  console.log(
    `✓ Found ${orders.length} order(s), rendering ${selected.length}\n`,
  );

  const outputDir = path.join(process.cwd(), 'output');
  await mkdir(outputDir, { recursive: true });

  let successCount = 0;
  let errorCount = 0;

  for (const order of selected) {
    const orderNumber = order.orderNumber || order.objectId || 'unknown';
    const sanitizedOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const outputPath = path.join(
      outputDir,
      `packing-slip-${sanitizedOrderNumber}.pdf`,
    );

    try {
      await generatePackingSlip(order, outputPath);
      console.log(`✓ ${path.basename(outputPath)}`);
      console.log(`  Order: ${orderNumber}`);
      console.log(`  Line items: ${order.lineItems?.length || 0}`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to render order ${orderNumber}`);
      console.error(`  ${error instanceof Error ? error.message : error}`);
      errorCount++;
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Rendered: ${successCount}, Errors: ${errorCount}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('='.repeat(50));

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
