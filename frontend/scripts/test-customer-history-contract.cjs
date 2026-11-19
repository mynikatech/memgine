const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const before = read("DB/liquibase/sql/268-customer-safe-transaction-history.sql");
const forward = read("DB/liquibase/sql/301-consolidate-customer-order-history.sql");
const kotlin = read("server/src/main/kotlin/com/mynikatech/memgine/component/receipt/TransactionReceipt.kt");
const signature = (sql) => sql.match(/receipt_customer_transaction_history\(\s*p_customer_user_id[\s\S]+?\)\s*RETURNS TABLE\(\s*([\s\S]+?)\s*\)/)[1];
const outputs = (sql) => signature(sql).trim().split(/\s*,\s*/).map((column) => column.trim());

assert.deepEqual(outputs(forward), [
  ...outputs(before), "subscription_id varchar", "item_description text", "canonical_order_id varchar",
]);
const oldFilter = before.match(/WHERE \(\$3 IS NULL OR x\.status=\$3\)[\s\S]+?LIMIT \$6 OFFSET \$7/)[0];
const newFilter = forward.match(/WHERE \(\$3 IS NULL OR x\.status=\$3\)[\s\S]+?LIMIT \$6 OFFSET \$7/)[0];
assert.equal(newFilter.replace(/\s+/g, " "), oldFilter.replace(/\s+/g, " "));
assert.match(forward, /DROP FUNCTION "\$\{schemaName\}"\.receipt_customer_transaction_history\(varchar,varchar,varchar,varchar,varchar,integer,integer\) RESTRICT;/);
assert.match(forward, /DROP FUNCTION IF EXISTS "\$\{schemaName\}"\.get_customer_order_history_metadata\(varchar,varchar\[\]\) RESTRICT;/);
assert.doesNotMatch(forward, /CREATE FUNCTION [^\n]+(?:get_customer_order_history_metadata|receipt_counter_transaction_history)/);
assert.match(forward, /coalesce\(nullif\(btrim\(r\.receipt_snapshot #>> '\{lines,0,description\}'\), ''\), recorded_line\.description\)/);
assert.match(forward, /FROM commerce_transaction_lines l[\s\S]+l\.created_at, l\.commerce_transaction_line_id\s+LIMIT 1/);
assert.match(kotlin, /SELECT \* FROM receipt_customer_transaction_history\(/);
assert.doesNotMatch(kotlin, /get_customer_order_history_metadata|CustomerOrderHistoryMetadata/);
