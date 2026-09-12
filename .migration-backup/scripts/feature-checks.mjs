import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function featureChecks({
  q,
  test,
  role,
  org,
  otherOrg,
  staff,
  need,
  vol,
}) {
  await test("automatic reminders age each giver independently", async () => {
    const id = await need(),
      old = await vol(),
      fresh = await vol();
    await q("update needs set quantity_required=2 where id=$1", [id]);
    await q("select claim_need($1,$2,$3,$4)", [org, id, old, "Donate"]);
    await q("select claim_need($1,$2,$3,$4)", [org, id, fresh, "Donate"]);
    await q(
      "update claims set created_at=now()-interval '3 days' where need_id=$1 and volunteer_id=$2",
      [id, old],
    );
    await q("select prepare_reminders($1)", [org]);
    const r = (
      await q(
        "select volunteer_id from notifications where need_id=$1 and kind='reminder'",
        [id],
      )
    ).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].volunteer_id, old);
  });
  const n = await need(),
    giver = await vol(),
    second = await vol();
  await q(
    "update needs set quantity_required=3,unit_label=$2,created_by=$3,poster_name=$4,public_location=$5 where id=$1",
    [n, "dressers", staff, "Morgan, social worker", "State College"],
  );
  const claim = (
    await q("select claim_need($1,$2,$3,$4,$5) id", [
      org,
      n,
      giver,
      "Donate",
      3,
    ])
  ).rows[0].id;
  const priorYear = new Date().getFullYear() - 1;
  const gift = {
    request_id: randomUUID(),
    quantity: 2,
    kind: "goods",
    amount_cents: 0,
    description: "Two dressers",
    received_at: `${priorYear}-12-31T23:00:00-05:00`,
  };
  await q("update organizations set ein='00-0000000' where id=$1", [org]);
  await test("a pledge never increases confirmed received quantity", async () => {
    const r = (await q("select * from needs where id=$1", [n])).rows[0];
    assert.equal(r.quantity_committed, 3);
    assert.equal(r.quantity_received, 0);
    assert.equal(r.status, "claimed");
  });
  await test("giver reports delivery without completing the need", async () => {
    await q("select report_delivery($1,$2,$3,$4)", [org, claim, giver, 2]);
    assert.equal(
      (await q("select quantity_received from needs where id=$1", [n])).rows[0]
        .quantity_received,
      0,
    );
  });
  await test("another volunteer cannot report or confirm someone else’s gift", async () => {
    await assert.rejects(
      q("select report_delivery($1,$2,$3,$4)", [org, claim, second, 2]),
      /valid delivered/,
    );
    await assert.rejects(
      q("select confirm_delivery($1,$2,$3,$4)", [org, claim, second, 2]),
      /access required/,
    );
  });
  await test("confirming two of three and releasing one leaves one available", async () => {
    await q("select confirm_delivery($1,$2,$3,$4,$5,$6)", [
      org,
      claim,
      staff,
      2,
      true,
      gift,
    ]);
    const r = (await q("select * from needs where id=$1", [n])).rows[0];
    assert.equal(r.quantity_received, 2);
    assert.equal(r.quantity_committed, 2);
    assert.equal(r.quantity_required, 3);
    assert.equal(r.status, "open");
  });
  await test("receipt queues automatically for the actual giver", async () => {
    const r = (
      await q(
        "select * from notifications where need_id=$1 and kind='donation_receipt'",
        [n],
      )
    ).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].volunteer_id, giver);
    assert.equal(
      (
        await q(
          "select * from notifications where need_id=$1 and kind='need_completed'",
          [n],
        )
      ).rowCount,
      0,
    );
  });
  await test("recorded gift retries do not duplicate receipts", async () => {
    await q("select record_contribution($1,$2,$3,$4)", [
      org,
      claim,
      staff,
      gift,
    ]);
    assert.equal(
      (await q("select id from contributions where claim_id=$1", [claim]))
        .rowCount,
      1,
    );
  });
  await test("extra receipts cannot exceed confirmed donations", async () => {
    await assert.rejects(
      q("select record_contribution($1,$2,$3,$4)", [
        org,
        claim,
        staff,
        { ...gift, request_id: randomUUID(), quantity: 1 },
      ]),
      /cannot exceed/,
    );
  });
  await test("requested quantity cannot hide existing commitments", async () => {
    await assert.rejects(
      q("select update_need_quantity($1,$2,$3,$4)", [org, n, staff, 1]),
      /below existing commitments/,
    );
  });
  await test("multiple givers can fulfill the same need without overclaiming", async () => {
    const others = await Promise.all([vol(), vol()]);
    const outcomes = await Promise.allSettled(
      others.map((v) =>
        q("select claim_need($1,$2,$3,$4,$5) id", [org, n, v, "Donate", 1]),
      ),
    );
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  });
  const last = (
    await q("select id from claims where need_id=$1 and volunteer_id<>$2", [
      n,
      giver,
    ])
  ).rows[0].id;
  await test("final staff confirmation completes the need and emails its posting social worker", async () => {
    await q("select confirm_delivery($1,$2,$3,$4)", [org, last, staff, 1]);
    const r = (await q("select * from needs where id=$1", [n])).rows[0];
    assert.equal(r.status, "completed");
    assert.equal(r.quantity_received, 3);
    const notice = (
      await q(
        "select * from notifications where need_id=$1 and kind='need_completed'",
        [n],
      )
    ).rows;
    assert.equal(notice.length, 1);
    assert.equal(notice[0].recipient_user_id, staff);
    assert.equal(notice[0].volunteer_id, null);
    await q("select confirm_delivery($1,$2,$3,$4)", [org, last, staff, 1]);
    assert.equal(
      (
        await q(
          "select * from notifications where need_id=$1 and kind='need_completed'",
          [n],
        )
      ).rowCount,
      1,
    );
  });
  await test("reports count confirmed gifts in the donor’s Eastern calendar year", async () => {
    const r = (
      await q("select run_reports($1,$2,$3) report", [
        org,
        `${priorYear}-01-01`,
        `${priorYear}-12-31`,
      ])
    ).rows[0].report;
    assert.equal(r.contributions.length, 1);
    assert.equal(r.contributions[0].quantity, 2);
    assert.equal(r.contributions[0].donor_id, giver);
  });
  await test("reports and donor statements remain private to the organization", async () => {
    await assert.rejects(
      role("anon", "select run_reports($1,$2,$3)", [
        org,
        `${priorYear}-01-01`,
        `${priorYear}-12-31`,
      ]),
      /permission denied/,
    );
    const r = (
      await q("select run_reports($1,$2,$3) report", [
        otherOrg,
        `${priorYear}-01-01`,
        `${priorYear}-12-31`,
      ])
    ).rows[0].report;
    assert.equal(r.contributions.length, 0);
    await assert.rejects(
      role("authenticated", "select * from donor_statements"),
      /permission denied/,
    );
  });
  await test("annual generation is idempotent and only includes recorded donations", async () => {
    assert.equal(
      (
        await q("select prepare_annual_statements($1,$2) count", [
          org,
          priorYear,
        ])
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await q("select prepare_annual_statements($1,$2) count", [
          org,
          priorYear,
        ])
      ).rows[0].count,
      0,
    );
    const r = (
      await q(
        "select snapshot from donor_statements where organization_id=$1",
        [org],
      )
    ).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].snapshot.contributions[0].quantity, 2);
    assert.equal(r[0].snapshot.cash_cents, 0);
    assert.equal(
      (
        await q(
          "select * from notifications where organization_id=$1 and kind='annual_statement'",
          [org],
        )
      ).rowCount,
      1,
    );
  });
  await test("current-year statements cannot be generated prematurely", async () => {
    await assert.rejects(
      q("select prepare_annual_statements($1,$2)", [org, priorYear + 1]),
      /completed calendar year/,
    );
  });
  await test("public feed reveals the posting identity and safe location but not photo paths", async () => {
    await q("select update_need_quantity($1,$2,$3,$4)", [org, n, staff, 4]);
    const r = (
      await role(
        "anon",
        "select public_location,poster_name,quantity_received from needs where id=$1",
        [n],
      )
    ).rows[0];
    assert.equal(r.public_location, "State College");
    assert.equal(r.poster_name, "Morgan, social worker");
    assert.equal(r.quantity_received, 3);
    await assert.rejects(
      role("anon", "select photo_path from needs"),
      /permission denied/,
    );
  });
}
