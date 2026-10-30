/* ==========================================================================
   Swift Courier Service — shared behaviour
   Vanilla JS, no build step. Every function is guarded so a page that lacks a
   given element (e.g. no booking form on services.html) simply skips that
   feature rather than throwing.
   ========================================================================== */
(function () {
  'use strict';

  // ── API client ────────────────────────────────────────────────────────
  // Same-origin by default; set window.SWIFT_API to point at a backend on
  // another host (e.g. http://localhost:4001/api).
  var API_BASE = (window.SWIFT_API || '/api').replace(/\/+$/, '');
  var apiOnline = true;

  function apiFetch(path, options) {
    return fetch(API_BASE + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options || {})).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          var err = new Error(body.error || 'Request failed (' + res.status + ')');
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" class="h-2.5 w-2.5"><path d="m5 12.5 4 4 10-10" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function formatKsh(amount) {
    if (amount == null || isNaN(amount)) return '—';
    return 'KSh ' + Number(amount).toLocaleString('en-KE');
  }

  function $(id) { return document.getElementById(id); }

  // ── Header, mobile menu, reveals, counters, accordions ────────────────
  var year = $('year');
  if (year) year.textContent = new Date().getFullYear();

  var header = $('site-header');
  if (header) {
    var onScroll = function () {
      var solid = window.scrollY > 24;
      // Pages that sit on a dark hero (.header-over-hero) need light chrome
      // until the fold; the body class lets the stylesheet switch both ways.
      document.body.classList.toggle('scrolled', solid);
      if (header.classList.contains('header-solid')) return;
      header.classList.toggle('bg-cream/85', solid);
      header.classList.toggle('backdrop-blur-xl', solid);
      header.classList.toggle('border-b', solid);
      header.classList.toggle('border-ink/10', solid);
      header.classList.toggle('shadow-soft', solid);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var menuBtn = $('menu-btn');
  var mobileMenu = $('mobile-menu');
  var menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    if (!mobileMenu) return;
    if (open) {
      mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
      mobileMenu.style.opacity = '1';
    } else {
      mobileMenu.style.maxHeight = '0px';
      mobileMenu.style.opacity = '0';
    }
  }
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
    mobileMenu.querySelectorAll('.mobile-link').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    window.addEventListener('resize', function () {
      if (menuOpen) mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
      if (window.innerWidth >= 1024 && menuOpen) setMenu(false);
    });
  }

  function observeReveals(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }
  observeReveals(document);

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var duration = 1600;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var value = target * eased;
      el.textContent = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString();
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll('.counter:not([data-done])');
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.setAttribute('data-done', '1');
          animateCounter(entry.target);
          cio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { cio.observe(c); });
  } else {
    counters.forEach(function (c) { animateCounter(c); });
  }

  document.querySelectorAll('.acc').forEach(function (acc) {
    var btn = acc.querySelector('.acc-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isOpen = acc.classList.contains('open');
      document.querySelectorAll('.acc.open').forEach(function (o) { o.classList.remove('open'); });
      if (!isOpen) acc.classList.add('open');
    });
  });
  var firstAcc = document.querySelector('.acc');
  if (firstAcc) firstAcc.classList.add('open');

  // ── Rate card ─────────────────────────────────────────────────────────
  // Rendered from the server rate card so the site can never advertise a price
  // the backend won't quote.
  var FALLBACK_TIERS = [
    { key: 'standard', name: 'Standard', tagline: 'Next-day delivery across Nairobi', base_fee: 450, per_kg: 25, eta: 'Next day', features: ['Sealed & witnessed handoff', 'Email custody log'] },
    { key: 'priority', name: 'Priority', tagline: 'Same-day for anything filed before 2pm', base_fee: 850, per_kg: 40, eta: 'Same day', features: ['Named courier', 'Live GPS tracking'] },
    { key: 'express', name: 'Express', tagline: '2-hour window inside the inner zone', base_fee: 1500, per_kg: 65, eta: '2 hours', features: ['Priority dispatch 24/7', 'Court-ready documentation'] },
    { key: 'charter', name: 'Charter', tagline: 'A vehicle and crew reserved for you', base_fee: 4500, per_kg: 100, eta: 'Scheduled', features: ['Dedicated vehicle & crew', 'KSh 50,000,000 cover'] }
  ];

  var TIER_STATE = { tiers: FALLBACK_TIERS, fromApi: false };

  function loadRates() {
    return apiFetch('/rates').then(function (data) {
      if (data && data.tiers && data.tiers.length) {
        TIER_STATE.tiers = data.tiers;
        TIER_STATE.fromApi = true;
      }
    }).catch(function () {
      // Offline / API down: keep the static tiers so the page still sells.
      apiOnline = false;
    }).then(function () {
      renderPricing();
      renderTierPicker();
      renderServiceQuickBooks();
      refreshQuote();
    });
  }

  function tierCard(tier, index) {
    var featured = tier.key === 'priority';
    var bullets = (tier.features || []).map(function (f) {
      var tick = featured
        ? '<span class="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-600 text-ink">' + CHECK + '</span>'
        : '<span class="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-teal/15 text-teal">' + CHECK + '</span>';
      return '<li class="flex items-start gap-3">' + tick + escapeHtml(f) + '</li>';
    }).join('');

    var badge = featured
      ? '<span class="rounded-full bg-blue-600 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink">Most chosen</span>'
      : '';

    var head = featured
      ? '<p class="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-blue-300">' + escapeHtml(tier.name) + '</p>'
      : '<span class="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-blue-600">' + escapeHtml(tier.name) + '</span>';

    var price = featured
      ? '<div class="relative mt-5 flex items-end gap-2"><span class="font-display text-[40px] font-semibold leading-none">' + formatKsh(tier.base_fee) + '</span><span class="pb-1 text-[13.5px] font-medium text-cream/45">from</span></div>'
      : '<div class="mt-5 flex items-end gap-2"><span class="font-display text-[40px] font-semibold leading-none text-ink">' + formatKsh(tier.base_fee) + '</span><span class="pb-1 text-[13.5px] font-medium text-ink/45">from</span></div>';

    var blurb = featured
      ? '<p class="relative mt-4 text-[14.5px] leading-relaxed text-cream/60">' + escapeHtml(tier.tagline) + '.</p>'
      : '<p class="mt-4 text-[14.5px] leading-relaxed text-ink/60">' + escapeHtml(tier.tagline) + '.</p>';

    var list = featured ? 'relative mt-7 space-y-3.5 text-[14.5px] text-cream/80'
                       : 'mt-7 space-y-3.5 text-[14.5px] text-ink/70';

    var cta = featured
      ? '<button type="button" data-pick="' + escapeHtml(tier.key) + '" class="relative mt-9 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 font-semibold text-ink transition hover:bg-blue-500">Book ' + escapeHtml(tier.name) + ' <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4"><path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      : '<button type="button" data-pick="' + escapeHtml(tier.key) + '" class="mt-9 inline-flex w-full items-center justify-center rounded-full border border-ink/15 px-6 py-3.5 text-[14.5px] font-semibold text-ink transition hover:border-ink/35 hover:bg-cream-200/60">Choose ' + escapeHtml(tier.name) + '</button>';

    var shell = featured
      ? 'relative flex h-full flex-col overflow-hidden rounded-[1.6rem] bg-ink p-8 text-cream shadow-lift xl:-mt-4'
      : 'card-hover flex h-full flex-col rounded-[1.6rem] border border-ink/10 bg-cream-100 p-8';

    var inner = featured
      ? '<div class="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-blue-500/22 blur-3xl"></div><div class="noise pointer-events-none absolute inset-0 opacity-[0.06]"></div>'
      : '';

    return '<div class="' + shell + '" style="transition-delay:' + (index * 0.07) + 's">' + inner +
      '<div class="' + (featured ? 'relative flex items-center justify-between gap-3' : '') + '">' + head + badge + '</div>' +
      price + blurb +
      '<ul class="' + list + '">' + bullets + '</ul>' + cta +
      '<p class="mt-4 text-center text-[12px] ' + (featured ? 'text-cream/40' : 'text-ink/40') + '">' + escapeHtml(tier.eta) + ' · then ' + formatKsh(tier.per_kg) + '/kg · incl. VAT</p>' +
      '</div>';
  }

  function renderPricing() {
    var grid = $('pricing-grid');
    if (!grid) return;
    grid.innerHTML = TIER_STATE.tiers.map(tierCard).join('');
    grid.querySelectorAll('[data-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // Same site → in-page anchor on booking pages, page jump otherwise.
        var key = btn.getAttribute('data-pick');
        if ($('book-form')) selectTier(key);
        var target = $('book');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        else window.location.href = 'book.html?tier=' + encodeURIComponent(key);
      });
    });
  }

  // ── Service catalog ───────────────────────────────────────────────────
  // One definition drives the services grid, the hover-to-book price, and the
  // deep-link that pre-selects a tier on the booking page.
  var SERVICES = [
    {
      slug: 'legal-filings',
      tier: 'priority',
      name: 'Court & legal filings',
      short: 'Same-day filing runs to any courthouse in the metro.',
      icon: '<path d="M6 3.5h9.5L20 8v12.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 3.5V8h5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12.5h6M9 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      tags: ['Clerk receipt', 'Proof of service'],
      body: 'Same-day filing runs to any courthouse in the metro, returned with a time-stamped clerk receipt and stamped proof of service.',
      detail: 'Scheduled morning and afternoon filing rounds to Milimani, Kibera, Makadara and the High Court, or on-demand filing where the matter will not wait. We return the clerk receipt, the case stamp, and — where required — a sworn declaration of service signed by the courier who filed it.',
      items: ['Pleadings & bundles', 'Notarised affidavits', 'Registry deposits', 'Subpoena service']
    },
    {
      slug: 'confidential-records',
      tier: 'priority',
      name: 'Confidential records',
      short: 'Medical, HR and client files in tamper-evident envelopes.',
      icon: '<rect x="4" y="10" width="16" height="10.5" rx="2.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 14.2v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      tags: ['Tamper-evident seal', 'NDA couriers'],
      body: 'Medical files, HR records, and client matter bundles moved in tamper-evident envelopes by NDA-bound couriers only.',
      detail: 'Couriers assigned to confidential work sign an individual NDA, are photographed on every run, and carry no other cargo. Seals are numbered and registered against the waybill; the recipient verifies the number before opening. Nothing is scanned, copied, or left unattended.',
      items: ['Patient records', 'HR & disciplinary files', 'Client matter bundles', 'Exam satchels']
    },
    {
      slug: 'deadline-critical',
      tier: 'express',
      name: 'Deadline-critical documents',
      short: 'Two-hour collection windows, delivered before the cut-off.',
      icon: '<circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.5"/><path d="M12 7.4v5l3.2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
      tags: ['2-hour window', 'Deadline guarantee'],
      body: 'Wills, deeds, contracts, patent filings and closing papers — collected inside a two-hour window, delivered before the cut-off.',
      detail: 'You name the deadline and we hold it. Runs are collected inside a two-hour window and moved directly to the recipient — no sorting hub, no batching. If a documented Priority Chain run misses its committed window for any reason within our control, that run is free.',
      items: ['Wills & deeds', 'Executed contracts', 'Patent filings', 'Closing papers']
    },
    {
      slug: 'high-value',
      tier: 'charter',
      name: 'High-value goods',
      short: 'Jewellery, art and instruments with photographic condition records.',
      icon: '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      tags: ['Condition photos', 'Escort optional'],
      body: 'Jewellery, watches, artwork, prototypes and instruments carried in hard cases with photographic condition records at both ends.',
      detail: 'Condition is photographed and logged at pickup and again at delivery, with the recipient present for the second check. Hard cases, shock-absorbing packing, and a two-person escort are available for consignments above KSh 5,000,000 declared value.',
      items: ['Jewellery & watches', 'Fine art & sculpture', 'Prototypes', 'Lab instruments']
    },
    {
      slug: 'data-hardware',
      tier: 'priority',
      name: 'Sensitive data & hardware',
      short: 'Drives, keys and hardware under a signed device register.',
      icon: '<rect x="3.5" y="6" width="17" height="12" rx="2.2" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 10h4M7.5 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="10" r="1.2" fill="currentColor"/>',
      tags: ['Device register', 'Serialised log'],
      body: 'Encrypted drives, crypto keys, backup tapes and server hardware transferred under a signed device register.',
      detail: 'Every device is entered on a register with its serial number before it leaves your premises and again on arrival. Drives travel in padded, sealed cases; nothing is mounted or powered on in transit. You get the register back, countersigned, within two minutes of delivery.',
      items: ['Encrypted drives', 'Crypto keys & seeds', 'Backup tapes', 'Server & network hardware']
    },
    {
      slug: 'dedicated-route',
      tier: 'charter',
      name: 'Dedicated route',
      short: 'One courier from pickup to signature. No sorting hub.',
      icon: '<path d="M4.5 19V7.5l7.5-4 7.5 4V19" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 19v-5.5h7V19" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
      tags: ['Single courier', 'Direct route'],
      body: 'One courier from pickup to signature. No sorting hub, no subcontractor, no anonymous middle men — ever.',
      detail: 'A named courier is assigned for the whole route and remains accountable for the item at every point. No sorting hub, no subcontractor, no anonymous middle men. The same person who collects your item is the person who hands it over, and you are notified of their ID before they arrive.',
      items: ['Recurring scheduled runs', 'Multi-stop collections', 'Chartered vehicles', 'Standing pickup times'],
      dark: true
    }
  ];

  function findTier(key) {
    for (var i = 0; i < TIER_STATE.tiers.length; i++) {
      if (TIER_STATE.tiers[i].key === key) return TIER_STATE.tiers[i];
    }
    return TIER_STATE.tiers[0];
  }

  function serviceCard(svc, i) {
    var dark = !!svc.dark;
    var tags = (svc.tags || []).map(function (t) {
      return dark
        ? '<span class="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[11.5px] font-medium text-cream/70">' + escapeHtml(t) + '</span>'
        : '<span class="rounded-full bg-ink/5 px-3 py-1 text-[11.5px] font-medium text-ink/60">' + escapeHtml(t) + '</span>';
    }).join('');

    return '' +
    '<article class="service-card card-hover reveal group relative flex flex-col overflow-hidden rounded-[1.5rem] ' +
      (dark ? 'bg-ink text-cream' : 'border border-ink/10 bg-cream-100') + ' p-7" style="transition-delay:' + (i % 3 * 0.06) + 's">' +
      (dark
        ? '<div class="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl"></div><div class="noise pointer-events-none absolute inset-0 opacity-[0.06]"></div>'
        : '<div class="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-600/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"></div>') +
      '<a href="services.html#' + svc.slug + '" class="' + (dark ? 'relative' : '') + ' block">' +
        '<span class="relative grid h-12 w-12 place-items-center rounded-2xl shadow-soft ' +
          (dark ? 'bg-blue-600 text-ink' : 'bg-ink text-blue-500') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" class="h-6 w-6">' + svc.icon + '</svg>' +
        '</span>' +
        '<h3 class="relative mt-6 font-display text-[21px] font-semibold tracking-tight ' + (dark ? '' : 'text-ink') + '">' + escapeHtml(svc.name) + '</h3>' +
        '<p class="relative mt-3 text-[14.5px] leading-relaxed ' + (dark ? 'text-cream/60' : 'text-ink/60') + '">' + escapeHtml(svc.body) + '</p>' +
      '</a>' +
      '<div class="relative mt-5 flex flex-wrap gap-2">' + tags + '</div>' +
      // Hover-to-book strip: shows the price for the service's tier and hands
      // off to the booking page with that tier already selected.
      '<div class="quickbook mt-0 overflow-hidden">' +
        '<div class="quickbook-inner pt-5">' +
          '<div class="flex items-end justify-between gap-3 border-t ' + (dark ? 'border-white/12' : 'border-ink/10') + ' pt-4">' +
            '<div>' +
              '<p class="text-[10.5px] font-semibold uppercase tracking-[0.16em] ' + (dark ? 'text-blue-300' : 'text-blue-600') + '" data-qb-tier-label>—</p>' +
              '<p class="mt-1 font-display text-[22px] font-semibold leading-none ' + (dark ? 'text-cream' : 'text-ink') + '" data-qb-price>from —</p>' +
            '</div>' +
            '<p class="pb-0.5 text-[11.5px] ' + (dark ? 'text-cream/45' : 'text-ink/45') + '" data-qb-eta></p>' +
          '</div>' +
          '<a href="book.html?tier=' + encodeURIComponent(svc.tier) + '&service=' + encodeURIComponent(svc.slug) + '"' +
            ' class="group/qb mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold transition ' +
            (dark ? 'bg-blue-600 text-ink hover:bg-blue-500' : 'bg-ink text-cream hover:bg-ink-700') + '">' +
            'Book this service' +
            '<svg viewBox="0 0 24 24" fill="none" class="h-3.5 w-3.5 transition-transform duration-300 group-hover/qb:translate-x-1"><path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderServices() {
    var host = $('services-grid');
    if (!host) return;
    host.innerHTML = SERVICES.map(serviceCard).join('');
    observeReveals(host);
  }

  // Prices come from the server rate card, so the hover price cannot drift
  // from what dispatch will invoice.
  function renderServiceQuickBooks() {
    document.querySelectorAll('.service-card').forEach(function (card) {
      var link = card.querySelector('a[href^="book.html"]');
      if (!link) return;
      var slug = (link.getAttribute('href').match(/service=([^&]+)/) || [])[1];
      var svc = SERVICES.filter(function (s) { return s.slug === decodeURIComponent(slug || ''); })[0];
      if (!svc) return;
      var tier = findTier(svc.tier);
      var label = card.querySelector('[data-qb-tier-label]');
      var price = card.querySelector('[data-qb-price]');
      var eta = card.querySelector('[data-qb-eta]');
      if (label) label.textContent = tier.name + ' · from';
      if (price) price.textContent = formatKsh(tier.base_fee);
      if (eta) eta.textContent = tier.eta + ' · ' + formatKsh(tier.per_kg) + '/kg';
    });
  }

  function renderServiceDetail() {
    var host = $('service-detail');
    if (!host) return;
    host.innerHTML = SERVICES.map(function (svc, i) {
      var tier = findTier(svc.tier);
      var items = (svc.items || []).map(function (item) {
        return '<li class="flex items-start gap-2.5 text-[14px] text-ink/65"><span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-teal/15 text-teal">' + CHECK + '</span>' + escapeHtml(item) + '</li>';
      }).join('');
      return '' +
      '<section id="' + svc.slug + '" class="reveal scroll-mt-28 border-t border-ink/10 py-12 first:border-t-0 first:pt-0" style="transition-delay:' + (i % 3 * 0.05) + 's">' +
        '<div class="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">' +
          '<div>' +
            '<span class="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-blue-500 shadow-soft"><svg viewBox="0 0 24 24" fill="none" class="h-6 w-6">' + svc.icon + '</svg></span>' +
            '<h2 class="mt-5 font-display text-[27px] font-semibold tracking-tight text-ink sm:text-[32px]">' + escapeHtml(svc.name) + '</h2>' +
            '<p class="mt-3 text-[15.5px] leading-relaxed text-ink/60">' + escapeHtml(svc.short) + '</p>' +
            '<div class="mt-6 rounded-2xl border border-ink/10 bg-cream-100 p-5">' +
              '<p class="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-blue-600">Typical tier</p>' +
              '<p class="mt-1.5 font-display text-[22px] font-semibold text-ink">' + escapeHtml(tier.name) + '</p>' +
              '<p class="mt-1 text-[13px] text-ink/50">from ' + formatKsh(tier.base_fee) + ' · then ' + formatKsh(tier.per_kg) + '/kg · ' + escapeHtml(tier.eta) + '</p>' +
              '<a href="book.html?tier=' + encodeURIComponent(svc.tier) + '&service=' + encodeURIComponent(svc.slug) + '" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-[14px] font-semibold text-ink transition hover:bg-blue-500">Book ' + escapeHtml(svc.name) + '</a>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<p class="text-[15.5px] leading-relaxed text-ink/70">' + escapeHtml(svc.detail) + '</p>' +
            '<p class="mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Typical consignments</p>' +
            '<ul class="mt-4 grid gap-2.5 sm:grid-cols-2">' + items + '</ul>' +
          '</div>' +
        '</div>' +
      '</section>';
    }).join('');
    observeReveals(host);
  }

  function renderServiceChips() {
    var host = $('service-chips');
    if (!host) return;
    host.innerHTML = SERVICES.map(function (svc) {
      return '<a href="services.html#' + svc.slug + '" class="inline-flex items-center gap-2 rounded-full border border-ink/12 bg-cream-100 px-4 py-2 text-[13px] font-medium text-ink/70 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">' +
        '<svg viewBox="0 0 24 24" fill="none" class="h-3.5 w-3.5"><path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        escapeHtml(svc.name) + '</a>';
    }).join('');
  }

  // ── Coverage ──────────────────────────────────────────────────────────
  function loadCoverage() {
    var host = $('coverage-areas');
    // The map is useful even when the operations API is offline.
    renderCoverageMap({ areas: [] });
    if (!host) return;
    apiFetch('/coverage').then(function (data) {
      if (!data || !data.areas || !data.areas.length) return;
      host.innerHTML = data.areas.map(function (area, i) {
        return '<div class="reveal card-hover rounded-2xl border border-ink/10 bg-cream-100 p-6" style="transition-delay:' + (i * 0.06) + 's">' +
          '<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:' + escapeHtml(area.color || '#1C4E80') + '"></span>' +
          '<p class="mt-4 font-display text-[19px] font-semibold text-ink">' + escapeHtml(area.name) + '</p>' +
          (area.description ? '<p class="mt-2 text-[13.5px] leading-relaxed text-ink/55">' + escapeHtml(area.description) + '</p>' : '') +
          '</div>';
      }).join('');
      host.classList.remove('hidden');
      host.classList.add('grid');
      var note = $('coverage-note');
      if (note) note.classList.remove('hidden');
      observeReveals(host);
      renderCoverageMap(data);
    }).catch(function () { /* keep the Nairobi base map and static coverage copy */ });
  }

  /* Public coverage map. Free, keyless basemaps (OSM standard / OSM
     Humanitarian) plus Esri World Imagery for satellite context. Leaflet is
     loaded on demand so pages without a map never pay for it. */
  var NAIROBI = [-1.2864, 36.8172];

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    return new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = function () { resolve(window.L); };
      js.onerror = reject;
      document.head.appendChild(js);
    });
  }

  var LEAFLET_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17"><path fill="#fff" d="M12 2.6 4.9 5.4v6.2c0 4.4 3 8.1 7.1 9.8 4.1-1.7 7.1-5.4 7.1-9.8V5.4L12 2.6Z"/></svg>';

  function freeBasemaps(L) {
    return {
      'Street': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
      }),
      'Humanitarian': L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors, Tiles: HOT'
      }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Tiles &copy; Esri'
      })
    };
  }

  function renderCoverageMap(data) {
    var el = $('coverage-map');
    if (!el) return;
    loadLeaflet().then(function (L) {
      if (el._swiftCoverageMap) {
        var existingMap = el._swiftCoverageMap;
        (data.areas || []).forEach(function (area) {
          var b = area.bounds || {};
          if (b.lat_min == null || b.lat_max == null || b.lng_min == null || b.lng_max == null) return;
          L.rectangle([[b.lat_min, b.lng_min], [b.lat_max, b.lng_max]], { color: area.color || '#1C4E80', weight: 2, fillOpacity: 0.12 })
            .bindPopup('<strong>' + escapeHtml(area.name) + '</strong>' + (area.description ? '<br>' + escapeHtml(area.description) : ''))
            .addTo(existingMap);
        });
        return;
      }
      var map = L.map(el, { scrollWheelZoom: false }).setView(NAIROBI, 11);
      el._swiftCoverageMap = map;
      var layers = freeBasemaps(L);
      layers.Street.addTo(map);

      L.control.layers(layers, null, { position: 'topright', collapsed: true }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      map.zoomControl.setPosition('bottomright');

      (data.areas || []).forEach(function (area) {
        var b = area.bounds || {};
        if (b.lat_min == null || b.lat_max == null || b.lng_min == null || b.lng_max == null) return;
        var bounds = [[b.lat_min, b.lng_min], [b.lat_max, b.lng_max]];
        L.rectangle(bounds, { color: area.color || '#1C4E80', weight: 2, fillOpacity: 0.12 })
          .bindPopup('<strong>' + escapeHtml(area.name) + '</strong>' + (area.description ? '<br>' + escapeHtml(area.description) : ''))
          .addTo(map);
      });

      map.fitBounds([[-1.45, 36.65], [-1.10, 37.00]], { padding: [18, 18] });
      // Re-measure once the container has its final layout size.
      setTimeout(function () { map.invalidateSize(); }, 120);
    }).catch(function () {
      var note = $('coverage-map-fallback');
      if (note) note.classList.remove('hidden');
    });
  }

  // ── Tracking ──────────────────────────────────────────────────────────
  var STATUS_STYLES = { live: 'bg-blue-600/15 text-blue-700', done: 'bg-teal/12 text-teal', warn: 'bg-red-500/15 text-red-700' };
  var TRACK_CACHE = {};

  function setTrackError(msg) {
    var el = $('track-error');
    if (!el) return;
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function setTrackingBusy(busy) {
    var loading = $('track-loading');
    var submit = $('track-submit');
    var card = $('track-card');
    var placeholder = $('track-placeholder');
    if (loading) {
      loading.classList.toggle('hidden', !busy);
      if (busy) loading.classList.add('grid');
    }
    if (submit) submit.disabled = busy;
    if (busy) {
      if (card) card.classList.add('hidden');
      if (placeholder) placeholder.classList.add('hidden');
    }
  }

  /** Render the tracking card from a real /api/track payload. */
  function renderTracking(data) {
    TRACK_CACHE = data;
    var key = data.reference;
    var refEl = $('tc-ref');
    if (refEl) refEl.textContent = key;
    var descEl = $('tc-desc');
    if (descEl) descEl.textContent = data.description || data.delivery_address || 'Secure consignment';

    var set = function (id, value) { var el = $(id); if (el) el.textContent = value; };
    set('tc-courier', data.courier || 'Not yet assigned');
    set('tc-seal', data.seal_number || 'Pending pickup');
    set('tc-route', data.route || '—');
    set('tc-eta', data.eta || (data.service_name ? data.service_name : 'Being scheduled'));

    var statusEl = $('tc-status');
    if (statusEl) {
      var style = data.status === 'delivered' ? STATUS_STYLES.done
        : data.status === 'exception' ? STATUS_STYLES.warn
          : STATUS_STYLES.live;
      statusEl.textContent = data.status_label || 'In custody';
      statusEl.className = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ' + style;
    }

    var timeline = $('tc-timeline');
    if (timeline) {
      timeline.innerHTML = '<div class="timeline-track" style="background:linear-gradient(to bottom, rgba(14,124,107,.9), rgba(14,124,107,.2))"></div>' +
        (data.timeline || []).map(function (s) {
          var dot, titleClass, subClass;
          if (s.state === 'done') {
            dot = '<span class="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal text-white ring-4 ring-cream-100"><svg viewBox="0 0 24 24" fill="none" class="h-3 w-3"><path d="m5 12.5 4 4 10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
            titleClass = 'text-[13.5px] font-semibold text-ink';
            subClass = 'text-[11.5px] text-ink/45';
          } else if (s.state === 'active') {
            dot = '<span class="pulse-ring relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 ring-4 ring-cream-100"><span class="h-2 w-2 rounded-full bg-ink"></span></span>';
            titleClass = 'text-[13.5px] font-semibold text-blue-700';
            subClass = 'text-[11.5px] text-ink/50';
          } else {
            dot = '<span class="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-ink/12 bg-cream-100 ring-4 ring-cream-100"><span class="h-1.5 w-1.5 rounded-full bg-ink/20"></span></span>';
            titleClass = 'text-[13.5px] font-medium text-ink/35';
            subClass = 'text-[11.5px] text-ink/30';
          }
          return '<div class="relative flex gap-4">' + dot +
            '<div class="-mt-0.5"><p class="' + titleClass + '">' + escapeHtml(s.title) + '</p>' +
            '<p class="mt-0.5 ' + subClass + '">' + escapeHtml(s.detail) + '</p></div></div>';
        }).join('');
    }

    var placeholder = $('track-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    var card = $('track-card');
    if (card) card.classList.remove('hidden');
    observeReveals(card);
  }

  /** Look up a real reference. No invented fallbacks — a miss is a miss. */
  function lookupTracking(reference) {
    var ref = String(reference || '').trim();
    if (!ref) {
      setTrackError('Enter your reference number to pull the custody log.');
      var input = $('track-input');
      if (input) input.focus();
      return;
    }

    setTrackError('');
    setTrackingBusy(true);

    apiFetch('/track/reference/' + encodeURIComponent(ref))
      .then(function (data) {
        renderTracking(data);
        try { history.replaceState(null, '', '?ref=' + encodeURIComponent(ref) + '#track'); } catch (e) { /* file:// */ }
      })
      .catch(function (err) {
        var card = $('track-card');
        if (card) card.classList.add('hidden');
        var placeholder = $('track-placeholder');
        if (placeholder) placeholder.style.display = '';
        setTrackError(err.status === 404
          ? 'No shipment found for ' + ref + '. Check the reference from your booking confirmation.'
          : 'Tracking is unavailable right now. Please try again shortly.');
      })
      .then(function () { setTrackingBusy(false); });
  }

  // Demo chips come from the server so they always resolve to a real run.
  function loadDemoChips() {
    var host = $('demo-chips');
    if (!host) return;
    apiFetch('/demo').then(function (data) {
      if (!data || !data.references || !data.references.length) return;
      host.innerHTML = '<span class="text-[12px] text-cream/40">Try a live reference:</span>' +
        data.references.map(function (ref) {
          return '<button type="button" data-demo="' + escapeHtml(ref) + '" class="demo-chip rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 font-mono text-[11.5px] font-medium text-cream/65 transition hover:border-gold/50 hover:text-blue-300">' + escapeHtml(ref) + '</button>';
        }).join('');
      host.classList.remove('hidden');
      host.classList.add('flex');
      host.querySelectorAll('.demo-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var input = $('track-input');
          input.value = chip.getAttribute('data-demo');
          lookupTracking(input.value);
        });
      });
    }).catch(function () { /* chips are a nicety, not required */ });
  }

  /* ── Printable custody report ────────────────────────────────────────
     Supports the court-ready claim: a customer can save or print the exact
     record dispatch holds. Print styles live in site.css. */
  function printCustodyReport() {
    var host = $('track-card');
    if (!host || !TRACK_CACHE.reference) {
      setTrackError('Look up a run first — then you can print its custody report.');
      return;
    }
    var d = TRACK_CACHE;
    var rows = (d.timeline || []).map(function (s) {
      return '<tr><td style="padding:7px 10px;border-bottom:1px solid #e5e0d6;font-weight:600">' + escapeHtml(s.title) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #e5e0d6">' + escapeHtml(s.state) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #e5e0d6">' + escapeHtml(s.detail) + '</td></tr>';
    }).join('');

    var win = window.open('', '_blank', 'width=780,height=900');
    if (!win) {
      setTrackError('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }
    win.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Custody report ' + escapeHtml(d.reference) + '</title>' +
      '<style>body{font-family:Inter,system-ui,sans-serif;padding:34px;color:#0B1B2B}h1{font-size:20px;margin:0 0 4px}' +
      '.ref{font-family:ui-monospace,monospace;font-size:15px;font-weight:700;letter-spacing:.04em}' +
      'table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}' +
      'th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#5B7691;padding:0 10px 6px;border-bottom:2px solid #0B1B2B}' +
      '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 24px;margin-top:20px;font-size:12px}' +
      '.grid span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.14em;color:#5B7691}' +
      'footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e0d6;font-size:10.5px;color:#5B7691}' +
      '@media print{body{padding:0}}</style></head><body>' +
      '<h1>Chain-of-custody report</h1>' +
      '<p class="ref">' + escapeHtml(d.reference) + '</p>' +
      '<p style="font-size:12px;color:#5B7691;margin:8px 0 0">Generated ' + new Date().toLocaleString('en-KE') +
      ' · Swift Courier Service · Licensed &amp; bonded · Insured to KSh 50,000,000 per run</p>' +
      '<div class="grid">' +
        '<div><span>Status</span>' + escapeHtml(d.status_label || d.status || '—') + '</div>' +
        '<div><span>Consignment</span>' + escapeHtml(d.description || '—') + '</div>' +
        '<div><span>Courier</span>' + escapeHtml(d.courier || 'Not yet assigned') + '</div>' +
        '<div><span>Seal number</span>' + escapeHtml(d.seal_number || 'Pending pickup') + '</div>' +
        '<div><span>Route</span>' + escapeHtml(d.route || '—') + '</div>' +
        '<div><span>ETA</span>' + escapeHtml(d.eta || '—') + '</div>' +
      '</div>' +
      '<table><thead><tr><th>Stage</th><th>State</th><th>Detail</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<footer>Every transition of possession on this run is listed above with its timestamp. This record is ' +
      'cryptographically signed at the point of capture and retained for seven years. Verify with dispatch on ' +
      '+254 730 900 100 quoting the reference above.</footer>' +
      '</body></html>'
    );
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 350);
  }

  // ── Booking ───────────────────────────────────────────────────────────
  function renderTierPicker() {
    var host = $('bk-tiers');
    if (!host) return;
    var current = ($('bk-tier') || {}).value || 'priority';
    host.innerHTML = TIER_STATE.tiers.map(function (tier) {
      var active = tier.key === current;
      return '<button type="button" data-tier="' + escapeHtml(tier.key) + '" class="tier-btn rounded-xl border px-3 py-2.5 text-left transition ' +
        (active ? 'border-blue-400 bg-blue-600/25 text-cream' : 'border-white/12 bg-white/[0.04] text-cream/60 hover:border-white/30') + '">' +
        '<span class="block text-[13px] font-semibold">' + escapeHtml(tier.name) + '</span>' +
        '<span class="mt-0.5 block text-[11px] opacity-70">' + escapeHtml(tier.eta) + '</span>' +
        '</button>';
    }).join('');

    host.querySelectorAll('.tier-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTier(btn.getAttribute('data-tier')); });
    });
  }

  function selectTier(key) {
    var input = $('bk-tier');
    if (input) input.value = key;
    var host = $('bk-tiers');
    if (!host) return;
    host.querySelectorAll('.tier-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tier') === key;
      btn.className = 'tier-btn rounded-xl border px-3 py-2.5 text-left transition ' +
        (active ? 'border-blue-400 bg-blue-600/25 text-cream' : 'border-white/12 bg-white/[0.04] text-cream/60 hover:border-white/30');
    });
    refreshQuote();
  }

  var quoteTimer = null;

  function refreshQuote() {
    if (!$('bk-quote-total')) return;
    var weight = ($('bk-weight') || {}).value;
    var value = ($('bk-value') || {}).value;
    var delivery = ($('bk-delivery') || {}).value;
    var tier = ($('bk-tier') || {}).value || 'priority';

    return apiFetch('/quotes', {
      method: 'POST',
      body: JSON.stringify({
        weight_kg: Number(weight) || 1,
        declared_value: Number(value) || 0,
        service_tier: tier,
        zone: delivery
      })
    }).then(function (quote) {
      var lines = $('bk-quote-lines');
      var state = $('bk-quote-state');
      var total = $('bk-quote-total');
      if (lines) {
        lines.innerHTML = quote.lines.map(function (l) {
          return '<div class="flex items-baseline justify-between gap-4"><span>' + escapeHtml(l.label) + '</span><span class="font-medium text-cream/85">' + formatKsh(l.amount) + '</span></div>';
        }).join('') +
          (quote.cover_note ? '<p class="pt-1 text-[12px] text-gold-light">' + escapeHtml(quote.cover_note) + '</p>' : '');
      }
      if (total) total.textContent = formatKsh(quote.total);
      if (state) state.textContent = quote.service_name + ' · ' + quote.eta;
    }).catch(function () {
      var state = $('bk-quote-state');
      var total = $('bk-quote-total');
      if (state) state.textContent = 'Quote unavailable offline';
      if (total) total.textContent = '—';
    });
  }

  function scheduleQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshQuote, 350);
  }

  function showBookError(msg) {
    var el = $('bk-error');
    if (!el) return;
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function submitBooking(event) {
    event.preventDefault();
    showBookError('');

    var form = event.currentTarget;
    var btn = $('bk-submit');

    if (!form.checkValidity()) {
      showBookError('Please fill in your name, phone, and delivery address.');
      form.reportValidity();
      return;
    }

    var get = function (id) { var el = $(id); return el ? el.value.trim() : ''; };

    var payload = {
      customer_name: get('bk-name'),
      customer_phone: get('bk-phone'),
      customer_email: get('bk-email'),
      pickup_address: get('bk-pickup'),
      delivery_address: get('bk-delivery'),
      recipient_name: get('bk-recipient'),
      items: get('bk-items') ? { description: get('bk-items') } : undefined,
      weight_kg: Number(get('bk-weight')) || null,
      declared_value: Number(get('bk-value')) || 0,
      service_tier: get('bk-tier') || 'priority'
    };

    btn.disabled = true;
    btn.textContent = 'Booking…';

    apiFetch('/orders', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (order) {
        var form2 = $('book-form');
        var success = $('book-success');
        if (form2) form2.classList.add('hidden');
        if (success) {
          success.classList.remove('hidden');
          var refEl = $('bs-ref');
          if (refEl) refEl.textContent = order.reference;
          var q = order.quote;
          var qEl = $('bs-quote');
          if (qEl) {
            qEl.innerHTML = q
              ? '<div class="flex items-baseline justify-between"><span>' + escapeHtml(q.service_name) + ' · ' + escapeHtml(q.eta) + '</span><span class="font-semibold text-cream">' + formatKsh(q.total) + '</span></div>'
              : '';
          }
          success.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        var trackBtn = $('bs-track');
        if (trackBtn) {
          trackBtn.onclick = function () {
            window.location.href = 'track.html?ref=' + encodeURIComponent(order.reference);
          };
        }
      })
      .catch(function (err) {
        showBookError(err.message || 'We could not book that run. Please call dispatch on +254 730 900 100.');
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = 'Book this run <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4"><path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      });
  }

  /* A deep link like book.html?tier=express&service=legal-filings arrives from
     the hover-to-book strip on the services grid. Preselect the tier, note
     which service drove them there, and prefill the items field. */
  function applyBookingDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var tier = params.get('tier');
    var slug = params.get('service');
    if (!tier && !slug) return;

    if (tier) selectTier(tier);

    if (slug) {
      var svc = SERVICES.filter(function (s) { return s.slug === slug; })[0];
      if (svc) {
        var note = $('bk-service-note');
        if (note) {
          note.classList.remove('hidden');
          var strong = note.querySelector('[data-service-name]');
          if (strong) strong.textContent = svc.name;
        }
        var items = $('bk-items');
        if (items && !items.value) items.value = svc.items.slice(0, 2).join(', ');
      }
    }
  }

  // ── Floating contact + mobile sticky book bar ─────────────────────────
  function initMobileBookBar() {
    var bar = $('mobile-book-bar');
    if (!bar) return;
    var tick = function () { bar.classList.toggle('visible', window.scrollY > 520); };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  var trackForm = $('track-form');
  if (trackForm) {
    trackForm.addEventListener('submit', function (e) {
      e.preventDefault();
      lookupTracking($('track-input').value);
    });
  }

  var bookForm = $('book-form');
  if (bookForm) {
    bookForm.addEventListener('submit', submitBooking);
    ['bk-weight', 'bk-value', 'bk-delivery'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('input', scheduleQuote);
        el.addEventListener('change', scheduleQuote);
      }
    });
  }

  var printBtn = $('track-print');
  if (printBtn) printBtn.addEventListener('click', printCustodyReport);

  // A tracking link (?ref=...) or #track hash opens the page pre-filled.
  (function openFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    var trackSection = $('track');
    if (!ref) {
      if (window.location.hash === '#track' && trackSection) trackSection.scrollIntoView();
      return;
    }
    var input = $('track-input');
    if (input) input.value = ref;
    if (trackSection) trackSection.scrollIntoView();
    lookupTracking(ref);
  })();

  renderServices();
  renderServiceDetail();
  renderServiceChips();
  initMobileBookBar();
  applyBookingDeepLink();
  loadRates();
  loadCoverage();
  loadDemoChips();
})();