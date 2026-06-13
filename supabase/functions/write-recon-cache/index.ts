import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const bucketName = "harvest-history-cache"

const supabase = createClient(supabaseUrl, supabaseServiceKey)

Deno.serve(async (req) => {
  // Verify secret header
  const secret = req.headers.get("x-cache-secret")
  if (secret !== "spawn-cache-2026") {
    return new Response("Unauthorized", { status: 403 })
  }

  try {
    console.log("[write-recon-cache] Starting cache generation...")

    // 1. Fetch all harvests with vendo info
    const { data: harvests, error: harvestError } = await supabase
      .from("harvests")
      .select(\`
        id,
        vendo_id,
        sheet_name,
        tg_name,
        harvest_date,
        harvested_at,
        harvest_window_start,
        coins_total,
        coins_free,
        coins_old,
        collector,
        route_code,
        admin_notes,
        system_total
      \`)
      .order("harvest_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000)

    if (harvestError) throw harvestError
    console.log(\`[write-recon-cache] Loaded \${harvests.length} harvests\`)

    // 2. Build window map
    const windowMap = {}
    harvests.forEach(h => {
      if (h.tg_name && h.harvest_window_start) {
        windowMap[h.tg_name] = h.harvest_window_start
      }
    })

    // 3. Fetch all TG transactions for all unique tg_names in harvest date range
    const allTgNames = [...new Set(harvests.map(h => h.tg_name).filter(Boolean))]
    console.log(\`[write-recon-cache] Fetching TG income for \${allTgNames.length} vendos...\`)

    const tgMap = {}

    // Batch fetch transactions for all vendos at once to avoid N+1
    const harvestDates = harvests.map(h => h.harvest_date).filter(Boolean)
    const minDate = harvestDates.length ? harvestDates.sort().shift() : "2026-01-01"
    const maxDate = harvestDates.length ? harvestDates.sort().pop() : new Date().toISOString().split("T")[0]

    // Fetch all transactions in the range
    let allTransactions = []
    let page = 0
    const pageSize = 1000
    while (true) {
      const { data: txs, error: txError } = await supabase
        .from("transactions")
        .select("vendo,amount,date")
        .gte("date", minDate)
        .lte("date", maxDate)
        .eq("is_skipped", false)
        .not("total_time", "like", "%w%")
        .or("extended.neq.1")
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (txError) throw txError
      if (!txs || txs.length === 0) break
      allTransactions = allTransactions.concat(txs)
      if (txs.length < pageSize) break
      page++
    }

    console.log(\`[write-recon-cache] Loaded \${allTransactions.length} transactions\`)

    // Build tgMap from transactions
    allTransactions.forEach(tx => {
      const vendoName = tx.vendo
      if (!tgMap[vendoName]) tgMap[vendoName] = {}
      if (!tgMap[vendoName][tx.date]) tgMap[vendoName][tx.date] = 0
      tgMap[vendoName][tx.date] += parseFloat(tx.amount) || 0
    })

    // Calculate totals
    Object.keys(tgMap).forEach(v => {
      tgMap[v]._total = Object.entries(tgMap[v])
        .reduce((s, [k, v]) => k === "_total" ? s : s + v, 0)
    })

    // 4. Build cache object
    const cacheData = {
      generated_at: new Date().toISOString(),
      harvest_count: harvests.length,
      transaction_count: allTransactions.length,
      harvests: harvests,
      tg_map: tgMap,
      window_map: windowMap,
      min_date: minDate,
      max_date: maxDate
    }

    // 5. Upload to bucket
    const cacheJson = JSON.stringify(cacheData)
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .update("reconciliation_cache.json", cacheJson, {
        contentType: "application/json",
        upsert: true
      })

    if (uploadError) throw uploadError

    console.log("[write-recon-cache] Cache uploaded successfully")

    return new Response(
      JSON.stringify({
        success: true,
        harvests_cached: harvests.length,
        transactions_cached: allTransactions.length,
        vendos: allTgNames.length,
        generated_at: cacheData.generated_at
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200
      }
    )
  } catch (err) {
    console.error("[write-recon-cache] Error:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    )
  }
})
