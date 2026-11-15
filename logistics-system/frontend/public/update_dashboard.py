#!/usr/bin/env python3
import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Old dashboard section - match with possible & entities
old_dashboard_pattern = r'<section id="dashboard" class="pt-8">\s*' \
    r'<div class="max-w-[1600px] mx-auto px-4 lg:px-8">\s*' \
    r'<div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">\s*' \
    r'<div>\s*' \
    r'<p class="text-\[11px\] font-semibold uppercase tracking-\[0\.25em\] text-blue">Operations</p>\s*' \
    r'<h1 class="mt-2 font-display text-\[26px\] font-semibold text-ink sm:text-\[32px\]">Live fleet & order dashboard</h1>\s*' \
    r'<p class="mt-2 text-sm text-ink/50">Real-time vehicle locations, active orders, and dispatch overview — all in one place\.</p>\s*' \
    r'</div>\s*' \
    r'<label class="flex items-center gap-2 text-sm text-ink/60">\s*' \
    r'<span class="text-\[11px\] font-semibold uppercase tracking-\[0\.14em\] text-ink/40">Auto-refresh</span>\s*' \
    r'<select id="poll-interval" class="bg-white border border-ink/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-soft">\s*' \
    r'<option value="0">Off</option>\s*' \
    r'<option value="5000" selected>5s</option>\s*' \
    r'<option value="15000">15s</option>\s*' \
    r'<option value="60000">1m</option>\s*' \
    r'</select>\s*' \
    r'</label>\s*' \
    r'</div>\s*'

# Try replacing with regex
match = re.search(old_dashboard_pattern, content, re.DOTALL)
if match:
    # Replace the dashboard section
    new_dashboard = '''<section id="dashboard" class="pt-8">
  <div class="max-w-[1600px] mx-auto px-4 lg:px-8">
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.25em] text-blue">Operations</p>
        <h1 class="mt-2 font-display text-[26px] font-semibold text-ink sm:text-[32px]">SaaS Revenue Analytics</h1>
        <p class="mt-2 text-sm text-ink/50">Real-time revenue insights, order performance, and financial KPIs — all in one place.</p>
      </div>
      <label class="flex items-center gap-2 text-sm text-ink/60">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">Auto-refresh</span>
        <select id="poll-interval" class="bg-white border border-ink/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-soft">
          <option value="0">Off</option>
          <option value="5000" selected>5s</option>
          <option value="15000">15s</option>
          <option value="60000">1m</option>
        </select>
      </label>
    </div>

    <div class="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Total Revenue</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-teal" id="kpi-total-revenue">0</p>
        <p class="mt-1 text-[11px] text-ink/40">KSh total across all orders</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Avg. Order Value</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-avg-order">0</p>
        <p class="mt-1 text-[11px] text-ink/40">per completed order</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Orders Today</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-orders-today">0</p>
        <p class="mt-1 text-[11px] text-ink/40">new orders placed</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Delivered Today</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-teal" id="kpi-delivered-today">0</p>
        <p class="mt-1 text-[11px] text-ink/40">completed successfully</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Revenue This Month</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-monthly-revenue">0</p>
        <p class="mt-1 text-[11px] text-ink/40">KSh collected this month</p>
      </div>
    </div>

    <div class="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Monthly Growth</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-teal" id="kpi-growth">0</p>
        <p class="mt-1 text-[11px] text-ink/40">% change vs previous month</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Active Subscriptions</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-subs">0</p>
        <p class="mt-1 text-[11px] text-ink/40">active service subscriptions</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Churn Rate</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-churn">0</p>
        <p class="mt-1 text-[11px] text-ink/40">orders not retained</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">Top Service Tier</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-tier">Standard</p>
        <p class="mt-1 text-[11px] text-ink/40">most popular tier</p>
      </div>
      <div class="card-hover bg-white rounded-2xl border border-ink/8 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">API Uptime</p>
        <p class="mt-2 font-display text-[26px] font-semibold text-ink" id="kpi-uptime">100</p>
        <p class="mt-1 text-[11px] text-ink/40">% successful API calls</p>
      </div>
    </div>
  </div>
</section>'''
    
    # Get the end position of the match
    end_pos = match.end()
    # Find the closing </section> tag
    close_match = re.search(r'</section>', content[end_pos:])
    if close_match:
        actual_end = end_pos + close_match.start() + len('</section>')
        content = content[:match.start()] + new_dashboard + content[actual_end:]
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Dashboard section replaced successfully')
    else:
        print('Could not find closing </section> tag')
else:
    print('Old dashboard section pattern not found')
    # Let's just find any dashboard section
    match = re.search(r'<section id="dashboard".*?</section>', content, re.DOTALL)
    if match:
        print('Found dashboard section (first 500 chars):')
        print(match.group()[:500])