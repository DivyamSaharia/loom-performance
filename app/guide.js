// W2 Looms · app/guide.js — The Guide panel: what every tab shows, how its figures are worked out, and what to do with them.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
// The guide opens on the section for the tab you are on, has its own contents and search, and shows the app's real marks
// (arrows, bm / best, pills) and two small example charts drawn with the app's own chart code. A Plant view user sees every
// section except Data health and Access, with Costing in the plant's own figures.
'use strict';
const GUIDE_TABS = {actions: 'g-actions', quality: 'g-quality', benchmarks: 'g-benchmarks', cfm: 'g-cfm', erpm: 'g-erpm', pressure: 'g-pressure',
  utilisation: 'g-utilisation', warp: 'g-warp', costing: 'g-costing', targets: 'g-targets', data: 'g-data', access: 'g-access', fabric: 'g-fabric'};
let GUIDE_Q = '';

function guideSections() {
  const tolR = S().tol_rpm_pct, tolA = S().tol_air_pct, eff = f0(EFF_BAD()), etg = f0(ERPM_TGT * 100);
  const P = (t) => el('p', {text: t});
  const B = (...xs) => el('ul', {class: 'gl'}, xs.filter(Boolean).map((x) => el('li', {}, x)));
  const K = (k, ...rest) => el('span', {}, el('b', {text: k + ' '}), ...rest);
  const bm = (t, cls) => el('button', {type: 'button', class: 'bmb' + (cls ? ' ' + cls : ''), tabindex: -1, text: t});
  const up = (t) => el('span', {class: 'delta up-bad', text: t}), dn = (t) => el('span', {class: 'delta up-good', text: t});
  // a small example trend: a loom's air per 1,000 picks against its benchmark and best, with a beam change marked
  const exTrend = () => lineChart({plain: true, noOpen: true, aria: 'Example trend', dates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
    series: [{name: 'Air per 1,000 picks', vals: [37.6, 36.4, 38.1, 36.9, 35.8, 35.2, 34.6], color: CC[0]}], refs: [{v: 33.4, label: 'Bm 33.4'}, {v: 32.2, label: 'Best 32.2'}], fmt: (v) => pn(v, 1)});
  const exFall = () => waterfall([{label: 'Yesterday', v: 24.4, total: true}, {label: 'Volume', v: 0.49}, {label: 'POWER', v: 0.37}, {label: 'OPERATOR', v: -0.02}, {label: 'All other', v: 0.04}, {label: 'Today', v: 25.28, total: true}], 'Example: why cost per pick moved');
  const plant = isPlant();

  const all = [
    {id: 'g-start', grp: 'Start here', title: 'How to read this app', body: [
      P('Each tab answers one question about the floor. The loom tabs (Actions to Warp breaks) are built from the Toyota shift reports, one point per complete day (both shifts in). Costing is built from the plant\'s own costing file. Targets and the switches are yours to set.'),
      B(K('The day picker', 'at the top shows the app as it stood on an earlier day. Benchmarks, best and targets stay today\'s.'),
        K('190 cm / 280 cm / Both widths', 'filters the loom tabs by loom width. Pressure always covers both, because one compressor serves the whole floor.'),
        K('Search', '(press /) finds a loom number or head group: pick a suggestion to open it, or keep typing to filter every table on the page.'),
        K('The section bar', 'under the title jumps between the sections of a long tab; "All sections" lists them.'),
        K('Click almost anything:', 'a loom number opens that loom, a head group opens its looms and benchmark, a bm or best figure shows the loom-days behind it, a chart point opens that day.')),
      el('p', {class: 'note', text: 'A red line under the title means the latest data is old: the plant\'s files may be missing or the daily run may have stopped.'})]},
    {id: 'g-marks', grp: 'Start here', title: 'Colours, arrows and marks', body: [
      el('div', {class: 'gmarks'},
        el('div', {}, el('span', {class: 'pill good', text: 'complete'}), ' ', el('span', {class: 'pill bad', text: 'missing'}), ' ', el('span', {class: 'pill warn', text: 'provisional'}), ' ', el('span', {class: 'pill info', text: 'likely beam'})),
        el('div', {}, dn('▼ −0.4 vs prior-days avg'), el('span', {class: 'note', text: '  green: moved the good way'})),
        el('div', {}, up('▲ +0.9 vs previous day'), el('span', {class: 'note', text: '  red: moved the bad way'})),
        el('div', {}, el('b', {text: '35.1 '}), el('span', {style: 'color:var(--bad)', text: '▲ '}), bm('bm 29.6', 'miss'), ' · ', bm('best 26.7', 'best'), el('span', {class: 'note', text: '  the missed reference is underlined in red'}))),
      B(K('bm', '= benchmark: what this head group normally achieves on this width (see Benchmark and best).'),
        K('best', '= the single best loom-day on record for it.'),
        K('tgt', '= your target from the Targets tab.'),
        K('line', `= the efficiency line: below ${eff}% is bad on any quality.`),
        K('▼ ▲ on a figure', 'means it is worse than a reference by more than its tolerance. Green or red on a change says whether it moved the good or bad way, not up or down.'),
        K('Toggle boxes', 'above a chart switch its lines on and off; your choice is kept on this device.'))]},
    {id: 'g-bench', grp: 'Ideas used everywhere', title: 'Benchmark, best and target', body: [
      P('Every head group gets a benchmark per loom width from all of its history. For RPM and effective RPM it is the 90th percentile of its loom-days (beaten by only 1 day in 10). For air per 1,000 picks and main pressure it is the 10th percentile (lower is better). Nothing is filtered out as an outlier.'),
      P('Best is the single best loom-day behind it: fastest RPM, lowest air, lowest pressure. Target is what you set on the Targets tab; the effective RPM target is ' + etg + '% of your target RPM.'),
      P('A benchmark is provisional (yellow) until it rests on 15 loom-days on 5 dates from 2 looms; read its gaps as indicative until then. Click any bm or best figure to see the exact loom-days and the arithmetic.')]},
    {id: 'g-panna', grp: 'Ideas used everywhere', title: 'Double panna (280 cm)', body: [
      P('A 280 cm loom weaves two panels, so each machine pick makes two fabric picks. Picks and air per 1,000 picks count both panels; RPM, CFM, pressure and the warp-break rate stay as the loom reads them. A head group that runs single panna on 280 cm can be switched on the Targets tab, and that applies at once.')]},
    {id: 'g-trends', grp: 'Ideas used everywhere', title: 'Trends and periods', body: [
      P('Each loom tab has a Trend card for one head group or one loom. The dashed lines are today\'s benchmark (Bm) and best, even when you look at an earlier day, and they stay flat: they belong to the quality the loom or head group is on at the end of the period (CFM worked at its latest RPM). A B on the date axis marks a beam change; an arrow at the top marks the day a loom changed head group, and the days before it are drawn but not judged, because the lines are another quality\'s. Click a point for that day, the ↗ next to a loom or head group in any table to load it into the card, and "View all trends" for every metric at once.'),
      el('div', {class: 'gex'}, el('div', {class: 'note', text: 'Example: a loom coming down towards its benchmark (made-up figures)'}), exTrend()),
      P('Period switches (7, 14, 30 days, month to date, Dates) pick the days a chart covers; your choice is kept on this device. On Costing, a period longer than 12 days also offers Weekly (one point per Monday–Sunday week), and a daily chart over 14 days shows 14 days at a time: swipe, drag, or use Earlier / Later. The "7-day average" box adds a smoothed line and fades the daily one.')]},

    {id: 'g-actions', grp: 'Tabs', title: 'Actions', tab: 'actions', body: [
      P('The to-do list for the latest day. The tiles compare the day with the average of the days before it.'),
      B(K('Work on these first:', 'the five looms worth most to fix that day, each with why (what is off and by how much) and its impact. Rupees a day = lost picks × the day\'s fixed and attendance-following cost per pick (costs that run whether the loom weaves or not), plus excess air × the compressor\'s rupees per ft³, plus that loom\'s step of the floor ladder. A loom whose warp breaks are high is flagged to check the beam first. A loom whose head group changed in either of the last 2 shifts is left out (listed under the card) until it has run 2 shifts on the new head group. Without the day\'s costing it ranks by lost picks, then extra air.')),
      P('Each card below lists only looms that need a look, worst first, with what it costs:'),
      B(K('RPM:', `below benchmark by more than ${tolR}% or below your target; picks lost in lakh.`),
        K('Efficiency:', `below ${eff}%; picks short of ${eff}%.`),
        K('CFM:', `above benchmark CFM by more than ${tolA}% or above your target; excess CFM while running.`),
        K('Pressure:', `main pressure more than ${PRESS_TOL} kgf/cm² above benchmark or target.`)),
      P('A loom style with no head group yet shows at the top with a red badge on Actions: answer it there (or in the Config Sheet) so its looms are benchmarked.'),
      P('Head-group names: a head group linked to a fabric on Head-group links is called by that fabric\'s name, exactly as the fabric app shows it (name and reed space), from the next hourly run, on every tab and for all its history. The small 190 or 280 label beside a name is the loom width, since one fabric can run on both. The name in the Config Sheet\'s Style map stays as it is: targets and switches saved under it carry over. A rename approved from the fabric app renames the head group; undoing the link gives the old name back. Head groups that end up with one name on one width are one head group: their looms are benchmarked and ranked together, each keeps its own link (a loom-day is priced by the group with most picks that day), and the targets and switches are the ones of the group already called by that name, else the busiest.'),
      B(K('The line in each tile:', 'the last 7 complete days up to the day shown; the dot is that day. Hover it for each day\'s figure.'),
        K('The bars in each card:', `how far each listed loom is past its reference, worst first, the same looms as the table. The tick is that loom's own tolerance (${tolR}% for RPM, ${tolA}% for CFM, ${PRESS_TOL} kgf/cm² for pressure): the faint part is inside it, the strong part is past it. Efficiency has no tolerance, so its bars are the points below the ${eff}% line. Click a bar for the loom.`))]},
    {id: 'g-quality', grp: 'Tabs', title: 'Quality', tab: 'quality', body: [
      P('One row per head group for the day shown (looms that ran at least 60 minutes), against its benchmark, best and your target, for every metric side by side. Drift alerts compare the latest day with the 7 days before it (and week on week once there are 14 days), so a slow slide shows up before it becomes the norm. Open a head group for its looms.'),
      B(K('Gap to the reference (the heat grid at the top):', `one cell per head group and metric: the day's figure as a % above (+) or below (−) the reference you pick with Benchmark / Best / Target (kept on this device). Green is better, red is worse, and the colour is full at ${HEAT_FULL}% or more. Efficiency is always against the ${eff}% line; warp breaks against the head group's median rate, so it has no best or target. A grey cell says why it has no reference (for example "no target"). Hover a cell for the two figures; click it to open the head group.`))]},
    {id: 'g-benchmarks', grp: 'Tabs', title: 'Benchmarks', tab: 'benchmarks', body: [
      P('Pick a quality on the left to see its benchmark and best for every metric, then the loom-days behind them: the two loom-days either side of the percentile, their weights, and every loom-day at or past the benchmark. Use it when a benchmark looks too easy or too hard; it shows exactly which runs set it.')]},
    {id: 'g-cfm', grp: 'Tabs', title: 'CFM', tab: 'cfm', body: [
      P('Air is the biggest lever on compressor power. Benchmark CFM is the head group\'s benchmark air per 1,000 picks at the RPM the loom actually ran, so a loom is not rewarded for running slow.'),
      B(K('If every loom ran at reference:', 'each loom above its reference (benchmark, best or target: your choice) brought down to it; looms already below stay. Total CFM now, after, and the % of compressor air saved.'),
          K('What it is worth:', 'saved air × the compressor\'s kWh per 1,000 ft³ that day × its ₹ per unit. Paise per pick = rupees saved ÷ the same looms\' picks. ×30 for a month at that day\'s level.'),
          K('Against benchmark, best and target, by head group:', 'one row per head group, most excess first, drawn like the by-loom chart: the bar is its CFM now, the tick its benchmark CFM at the RPM it ran, the green dot its best, the diamond your target; +n is the excess over the reference switched at the top. Click a row for the head group.'),
          K('Total CFM by day:', 'one bar a day for the last 14 days: grey is what the floor would draw with every loom at its reference, the coloured parts are the excess above it, split by the head groups with the most excess. "Excess only" redraws the coloured part on its own scale so small excesses can be compared.'),
          K('By loom / vs benchmark:', 'the looms with the most excess first; the bar is now, the dot is the reference.'),
          K('Compressor power:', 'the Power (Compressor) line from the costing against the floor\'s air, in kWh per 1,000 m³ of air.')),
      el('p', {class: 'note', text: 'These savings use the compressor\'s own line in the costing, not the plant\'s whole POWER bill, and are not added to the Pressure savings (the two overlap).'})]},
    {id: 'g-erpm', grp: 'Tabs', title: 'Effective RPM', tab: 'erpm', body: [
      P(`Effective RPM = RPM × efficiency ÷ 100: the picks a loom really makes per minute, counting speed and stoppages together. Benchmark is the 90th percentile of the head group's loom-days, best its highest, target ${etg}% of your target RPM. "Short" is the gap to the reference and "picks short" what that gap cost in the day.`)]},
    {id: 'g-pressure', grp: 'Tabs', title: 'Pressure', tab: 'pressure', body: [
      P('One compressor serves both widths, so this tab always covers all looms. The loom with the highest main pressure sets the floor; the compressor must give that plus the line drop. Bring the high looms down and the setpoint can come down.'),
      B(K('Floor after the work:', 'the highest pressure left once every loom is at its reference, and which loom holds it.'),
        K('Energy saved:', 'a range: the low end is your % per 1 kgf/cm² rule (Targets tab), the high end the adiabatic estimate.'),
        K('Floor ladder:', 'the order to work in. Step 1 brings the loom setting the floor down to its reference; the floor then sits at the next-highest loom, and so on for five steps. Green bars are how far each step drops the floor (0 when two looms share the top), and the table adds the energy and money saved so far. It stops early when the loom at the top has no reference or is already at it, and says which.'),
        K('Paise per pick:', 'over the whole floor\'s picks, because a pressure saving is a whole-compressor saving.'),
        K('190 / 280 / All', 'inside the by-loom cards only picks which looms are listed; every total covers all looms.'))]},
    {id: 'g-utilisation', grp: 'Tabs', title: 'Utilisation', tab: 'utilisation', body: [
      P(`Looms powered down for ${OFF_LONG / 60} hours or more in the day (a loom missing from a shift file counts as off for that shift), and looms below ${eff}% efficiency on at least ${LOW_EFF_DAYS} of their last ${LOW_EFF_WINDOW} running days. "Likely beam" means the low days line up with a beam change.`),
      B(K('Run, stopped and powered down:', 'the calendar at the top: one row per loom, one column per day for the last 14 days. Each cell is that loom\'s 24 hours stacked from the bottom: blue run, orange stopped, grey powered down. Looms that lost the most hours come first, so a loom that keeps stopping or is often off stands out. Click a cell to open the loom on that day.'))]},
    {id: 'g-warp', grp: 'Tabs', title: 'Warp breaks', tab: 'warp', body: [
      P('Warp stops point to warping and beam quality more than loom settings. Counts are breaks; rates are breaks per 100,000 picks, so looms on different speeds compare fairly. By quality ranks head groups; pick one for its looms against the head group\'s median. Flagged looms are well above their head group\'s median (by the multiple and floor rate in the settings) on several of their last 5 running days: check the beam (its number is listed) before the loom.'),
      B(K('Break rate by beam:', 'each beam still on its loom that ran in the period, ranked by its break rate over its whole run on the loom. A beam already changed out is left off: it cannot be acted on. The tick is its head group\'s beam line; the strong part of a bar is past it.'))]},
    {id: 'g-costing', grp: 'Tabs', title: 'Costing', tab: 'costing', body: [
      P(plant ? 'Built from the plant\'s own costing file, one day at a time, November onward.' : 'Built from the plant\'s costing file, one day at a time, November onward. It stands on its own: metres, picks and looms running can differ from the loom tabs, which use the Toyota reports.'),
      B(K('Cost per pick', '= (total expenses + cut-piece loss) ÷ picks, in paise. Picks = fabric picks ÷ 39.37, the costing sheet\'s basis. B-grade loss is shown separately and not added.'),
        K('Folded cost per pick', 'uses the A-grade folded picks instead, so it moves the other way on a day folding runs ahead of or behind production.'),
        plant ? null : K('Power units', 'opens on the plant\'s figures as entered; Corrected is one tap away.'),
        K('Fixed per day', 'is the share of the day\'s cost that does not change with output.'),
        !plant && typeof fxIsOwner === 'function' && fxIsOwner() ? K('Sheet checks (owner only)', 'the costing run\'s errors and warnings in the plant\'s file, the plant file against the recomputed costing line by line, and the month to date in the file against the sum of the day amounts. "—" means not read or a day missing, never zero.') : null,
        !plant && typeof fxIsOwner === 'function' && fxIsOwner() ? K('Day rules (owner only)', 'days left out of costing (such as the Diwali shutdown, 8 and 9 Nov 2026) and double-pay days (costed at single cost, such as 10 to 12 Nov) are set in the Config sheet\'s Settings tab. The plant\'s month totals still carry them: Sheet checks show that part as expected, and list every line where the plant\'s progressive misses the correct double pay, with the rupee gap.') : null),
      el('div', {class: 'gex'}, el('div', {class: 'note', text: 'Example: why cost per pick moved (made-up figures)'}), exFall()),
      P('Why cost per pick moved: grey bars are yesterday and today; red pushed cost per pick up, green pulled it down. Volume is what yesterday\'s total cost would have been per pick at today\'s picks: fewer picks spread the fixed cost thinner. Each line after that is its change in rupees ÷ today\'s picks. The effects add up exactly to the change.'),
      B(K('Why cost per pick moved this month:', 'the same bridge from the month\'s first costing day to the day shown, so a month\'s drift reads in one chart. Its effects add up exactly to the change too. It compares those two days; the month-to-date cost per pick is the figure in the tiles.'),
        K('Shown to 2 decimals:', 'the effects in both bridges are rounded so that the figures on screen add up to the change shown.'),
        K('Cost per pick by cost type:', 'cost per pick day by day (or week by week) as stacked bars: fixed per day, follows attendance, follows output, lumpy, and the cut-piece loss. They add up to the headline cost per pick (the dashed mark and the figure on top). Hover any block for its figure and share; click a cost type in the legend to highlight it across the days. The fixed layer grows on a low-picks day: that is volume, not spending.'),
        K('Converting cost per metre, highest first:', 'the Production card\'s day figure as ranked bars. It is the day\'s cost per pick × each quality\'s picks per inch, so the order follows picks per inch.')),
      B(K('Fixed against variable:', 'every cost line is tagged once: fixed per day, follows attendance, follows output, or lumpy (a bill on some days, nothing on others). Read a jump in lumpy lines as timing, not a trend.'),
        K('Production by quality head group:', 'metres, picks and looms by quality, Today or Month to date. Converting cost per metre = the day\'s cost per pick × the quality\'s picks per inch.'),
        K('Stock and dispatch:', 'stock days = closing stock ÷ metres produced (a day, or the month\'s daily average); dispatch % = metres dispatched ÷ metres produced.'),
        K('B grade and cut pieces:', 'metres, share of folded metres and ₹ loss, by head group and by loom (click a loom for its register entries), and the reasons grouped from the register\'s remarks. B grade is costed at 50% of the quality\'s rate, cut pieces at ₹60 a metre.'),
        K('B-grade reasons chart:', 'one bar per reason, most metres first, with its share of all B grade in the period. A remark naming two problems counts under both, so the shares add up to more than 100% and there is no running total.'),
        K('B grade share by head group, latest day and the rest of the period:', 'the latest register day has its own column at the right; the days before it are in 7-day blocks counted back from it. Each cell is the head group\'s B-grade metres ÷ the metres it produced then, stronger red for a higher share. Red across a whole row is a standing problem; red only on the latest day is new. Click a head group (here or in B grade by head group) to open its looms in Loom-wise B grade.'),
        K('Files:', 'each day\'s checks: expense lines add to the total, total ÷ picks matches the sheet, today\'s progressive equals yesterday\'s total.'))]},
    {id: 'g-targets', grp: 'Tabs', title: 'Targets', tab: 'targets', body: [
      P('Set any of target CFM, RPM and main pressure per head group and width; leave a box empty for none. Targets apply on every tab as soon as you save, and are kept in the Config Sheet. "Now" beside each box is the latest day, with bm and best for comparison. Also here: single or double panna for 280 cm head groups, and the compressor\'s % energy per 1 kgf/cm² of pressure used on the Pressure tab. Saving needs the Edit targets role.'),
      B(K('The small bar beside each box:', 'now (lime bar), benchmark (tick), best (green dot) and your target (hollow diamond, as you type it) on one scale. A target that sits on the wrong side of the benchmark, looser than what the head group already does, is obvious at a glance.'))]},
    {id: 'g-data', grp: 'Tabs', title: 'Data health', tab: 'data', body: [
      P('Which days are complete, every file the daily run looked at (and why one was set aside), other alerts from the run, and the settings in use (edited in the Settings tab of the Config Sheet). Look here first when a day is missing or a figure looks wrong.'),
      B(K('Last 30 days:', 'a calendar, Monday first: green days are complete (both shifts in), red days are missing or incomplete, grey days come after the newest file and are not in yet. A red day in the middle is a gap to chase.'),
        K('Files per day:', 'one bar per day of the files the run looked at, coloured by what it did with them: read, set aside (the Files table says why), duplicate or superseded. Two read files is a normal day.'))]},
    {id: 'g-access', grp: 'Tabs', title: 'Access', tab: 'access', admin: true, body: [
      P('Anyone can ask for access by signing in with a code sent to their email; they see nothing until you approve them with a role here. You can also add someone directly, change a role, or remove a person (their access stops at once).'),
      B(K('Plant view:', 'every tab except Data health and this one, read only; Costing in the plant\'s own figures.'), K('View:', 'every tab, read only.'), K('Edit targets:', 'also saves targets, head-group answers and switches.'), K('Admin:', 'also this screen.'))]},
    {id: 'g-fabric', grp: 'Tabs', title: 'Fabric health', tab: 'fabric', admin: true, body: [
      P('What the app last read from the fabric database app for Weavelon 2. The read is view-only: it never changes the fabric app, and no figure in this app uses these values yet. Reads run after each hourly run and when you tap Check now.'),
      B(K('Flags in red:', 'no price, no PPI, a missing warp or weft line, a yarn with no rate, or a value that cannot be read. These would stop a fabric being valued.'),
        K('Flags in amber:', 'the same on-screen name as another record, assigned to another unit too, or a name that looks like a sample, test or copy.'),
        K('A stopped read:', 'when a column or tab the app needs is missing, or Weavelon 2 cannot be confirmed, nothing is written until the fabric app is fixed. (The "more than 5 fabrics changed" stop was switched off on 11 Nov 2026; changed fabrics are only listed.)'))]},
    {id: 'g-approvals', grp: 'Tabs', title: 'Approvals', tab: 'approvals', admin: true, body: [
      P('Every change the fabric app makes to a Weavelon 2 fabric, yarn or rate waits here until you decide. A change shows once it has held for about 30 minutes, so quick trials never arrive; a value changed back before you decide withdraws itself.'),
      B(K('Money changes:', 'price, sale terms, construction, yarn lines, yarn counts and rates. One at a time, each with an effective-from date: "new from a date" (the world changed) or "correction" (the old value was wrong for its whole period). Past and future dates work. Preview the impact first; a jump over 25% asks again.'),
        K('Descriptive changes:', 'names, weave, notes: tick and approve together in one tap.'),
        K('Rejected:', 'the fabric app says one thing, you kept another. Asked again only if the fabric app changes it once more. "Approve after all" is there.'),
        K('History and undo:', 'every decision, with who and when. Undo saves the reversal as a new version and puts the change back in Pending; nothing is erased.'))]},
    {id: 'g-masters', grp: 'Tabs', title: 'Fabric masters', tab: 'masters', admin: true, body: [
      P('The dashboard\'s own copy of the Weavelon 2 fabrics, yarns and rates. It starts with a first import you review fabric by fabric (first rates from 1 Nov 2026); after that only an approval adds to it, and every change is a new dated entry.'),
      B(K('Not imported:', 'fabrics you skipped. Bring one in and it comes back as a new-fabric request.'), K('Pause the sync:', 'stops the reads and requests; the masters stay as they are.'),
        K('Realisation switch:', 'only Divyam, once the first import is accepted and the independent review is recorded.'))]},
    {id: 'g-links', grp: 'Tabs', title: 'Head-group links', tab: 'links', admin: true, body: [
      P('Which fabric each loom head group is, per loom width: one greige and one RFD record, covering every style name you grouped under it (a head group is the quality). Suggested from the 4-digit codes in those style names, narrowed by a reed space in a name and what fits the loom; never from a name alone, and never linked until you confirm. Unlinked picks are shown as a gap in the analysis.'),
      B(K('As sold on:', 'one tap per linked head group picks the record the Realisation tab\'s As sold view values it on, greige or RFD. Blank means greige where a greige record is linked, else RFD. The choice is kept with the link and survives undo.'))]},
    {id: 'g-realisation', grp: 'Tabs', title: 'Realisation', tab: 'realisation', admin: true, body: [
      P('Sale value at prevailing rate, realisation (sale value less standard yarn cost) and profit (realisation less the day\'s cost per pick and the loom\'s own B grade), in rupees, paise per pick and rupees per loom per day. Built from approved masters only; what cannot be valued is a gap with its reason, never a zero and never a guess.'),
      B(K('Basis:', 'As sold (the default) values each head group on its own default record, greige where a greige record is linked, else RFD, or the record you set with one tap on Head-group links, so one screen can cover every pick. Greige and RFD value every link on that record and leave the other kind as a gap: what-if views.'),
        K('Coverage:', 'one bar of priced-and-costed, priced-only and gap picks, with every reason and a link to where it is put right (Head-group links, Approvals, Fabric masters, Costing). Below 90% priced the headline figures are dimmed.'),
        K('Trend:', 'realisation, profit and sale value per pick each day, toggle boxes for the lines, the period from the sticky bar, weekly on request past 12 days, a pan window for long periods. Dashed markers are days a money approval took effect; hover one to read it. Click a point for that day\'s loom-days.'),
        K('By loom / By head group:', 'right after Trend: profit, realisation (₹ per loom per day) or realisation per pick (paise) as bars either side of zero, with the plant as the dashed line, at Running, Benchmark, Best or Target effective RPM. Every table and ranked bar chart in the app has a Sorting basis picker and Ascending / Descending; every line chart shows the day you point at under it, with Open this day.'),
        K('Per pick:', 'sale value → yarn → conversion → B grade → profit in paise, over costed loom-days only so the steps add up exactly. Every row of By loom, By head group and By width opens the loom-days behind it with the same chart for that subject; loom numbers and head groups still open their own panels.'),
        K('Lost realisation:', 'the Actions tab\'s lost picks (below the efficiency line, or RPM under its reference) for every day of the period × that loom-day\'s realisation per pick, per loom and per head group, with a period total and the last 7 days as a trend. A lost pick on an unpriced loom-day is counted, not valued.'))]},
  ];
  // Plant view (10 Nov 2026): every section except Data health and Access; Costing in the plant's own figures.
  return all.filter((x) => (x.id !== 'g-realisation' || (typeof fxAnalysisOn === 'function' && fxAnalysisOn())) && (plant ? !['g-data', 'g-access', 'g-fabric', 'g-approvals', 'g-masters', 'g-links', 'g-realisation'].includes(x.id) : !(x.admin && !(typeof ME !== 'undefined' && ME && ME.role === 'admin'))));
}

function openGuide() {
  GUIDE_Q = '';
  pushView(() => guideView());
  const id = GUIDE_TABS[TAB];
  if (id) requestAnimationFrame(() => { const t = panelEl().querySelector('#' + id); if (t) { t.classList.add('here'); t.scrollIntoView({block: 'start'}); } });
}
function guideView() {
  const secs = guideSections(), here = GUIDE_TABS[TAB];
  const body = el('div', {class: 'guide'});
  const draw = () => {
    const q = GUIDE_Q.trim().toLowerCase();
    const shown = secs.filter((x) => !q || (x.title + ' ' + x.body.map((b) => b.textContent || '').join(' ')).toLowerCase().includes(q));
    const groups = [...new Set(shown.map((x) => x.grp))];
    body.replaceChildren(
      el('nav', {class: 'gtoc', 'aria-label': 'Guide contents'}, groups.map((g) => el('div', {}, el('h4', {text: g}),
        el('div', {class: 'gchips'}, shown.filter((x) => x.grp === g).map((x) => el('button', {type: 'button', class: 'chip' + (x.id === here ? ' on' : ''), text: x.title,
          onclick: () => { const t = body.querySelector('#' + x.id); if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'}); }})))))),
      ...(shown.length ? shown.map((x) => el('section', {class: 'gsec' + (x.id === here ? ' here' : ''), id: x.id},
        el('h3', {}, x.title, x.id === here ? el('span', {class: 'pill lime', text: 'this tab'}) : null,
          x.tab && x.tab !== TAB ? el('button', {class: 'link', type: 'button', text: 'Open tab ›', onclick: () => { closePanel(); setTab(x.tab); }}) : null),
        ...x.body.filter(Boolean))) : [el('p', {class: 'empty', text: 'Nothing in the guide matches. Try a shorter word.'})]));
  };
  const box = el('input', {type: 'search', class: 'gsearch', placeholder: 'Search the guide', 'aria-label': 'Search the guide', value: GUIDE_Q,
    oninput: (e) => { GUIDE_Q = e.target.value; draw(); }});
  draw();
  return {title: 'Guide', sub: 'What each tab shows, how its figures are worked out, and what to do with them', body: [el('div', {class: 'guide'}, box), body]};
}
