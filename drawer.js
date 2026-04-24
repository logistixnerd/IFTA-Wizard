/**
 * Drawer — Reusable right-side detail panel
 *
 * API
 * ───
 *  Drawer.open(config)
 *  Drawer.close()
 *  Drawer.isOpen()
 *
 * Config shape
 * ────────────
 *  {
 *    entityType : string,          // badge label (e.g. "Vehicle", "Driver")
 *    title      : string,          // primary heading
 *    subtitle   : string,          // secondary line (optional)
 *    sections   : Section[],       // see below
 *    actions    : Action[],        // footer buttons (optional)
 *  }
 *
 * Section shapes
 * ──────────────
 *  // Key-value fields
 *  { heading: string, fields: [{ label, value, status?, badge? }] }
 *
 *  // Related record links
 *  { heading: string, records: [{ label, meta?, icon?, href?, onClick? }] }
 *
 *  // Activity timeline
 *  { heading: string, timeline: [{ text, time?, type? }] }
 *  //  type: 'ok' | 'warn' | 'danger' | 'info'
 *
 *  // Inline action buttons
 *  { heading: string, actions: Action[] }
 *
 * Action shape
 * ────────────
 *  { label, primary?, danger?, href?, onClick?, icon? }
 *
 * Icon names (records + buttons)
 * ──────────────────────────────
 *  'driver' | 'truck' | 'trailer' | 'doc' | 'trip' | 'alert' | 'defect' | 'clock'
 */

(function (global) {
    'use strict';

    var _backdrop = null;
    var _panel    = null;
    var _body     = null;
    var _footer   = null;
    var _open     = false;

    /* ── DOM bootstrap ─────────────────────────────────── */

    function bootstrap() {
        if (_panel) return;

        _backdrop = document.createElement('div');
        _backdrop.id = 'drawerBackdrop';
        _backdrop.className = 'dr-backdrop';
        _backdrop.setAttribute('aria-hidden', 'true');

        _panel = document.createElement('aside');
        _panel.id = 'drawerPanel';
        _panel.className = 'dr-panel';
        _panel.setAttribute('role', 'dialog');
        _panel.setAttribute('aria-modal', 'true');
        _panel.setAttribute('tabindex', '-1');

        _panel.innerHTML =
            '<div class="dr-header">' +
                '<div class="dr-header-main">' +
                    '<span class="dr-entity-badge" id="drEntityBadge" style="display:none"></span>' +
                    '<div class="dr-title" id="drTitle"></div>' +
                    '<div class="dr-subtitle" id="drSubtitle" style="display:none"></div>' +
                '</div>' +
                '<button class="dr-close" id="drClose" aria-label="Close">' +
                    svg('close') +
                '</button>' +
            '</div>' +
            '<div class="dr-body" id="drBody"></div>' +
            '<div class="dr-footer" id="drFooter"></div>';

        document.body.appendChild(_backdrop);
        document.body.appendChild(_panel);

        _body   = document.getElementById('drBody');
        _footer = document.getElementById('drFooter');

        document.getElementById('drClose').addEventListener('click', close);
        _backdrop.addEventListener('click', close);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _open) close();
        });
    }

    /* ── Open ──────────────────────────────────────────── */

    function open(config) {
        bootstrap();
        config = config || {};

        /* Header */
        var badgeEl    = document.getElementById('drEntityBadge');
        var titleEl    = document.getElementById('drTitle');
        var subtitleEl = document.getElementById('drSubtitle');

        if (config.entityType) {
            badgeEl.textContent = config.entityType;
            badgeEl.style.display = '';
        } else {
            badgeEl.style.display = 'none';
        }

        titleEl.textContent = config.title || 'Record Details';

        if (config.subtitle) {
            subtitleEl.textContent = config.subtitle;
            subtitleEl.style.display = '';
        } else {
            subtitleEl.style.display = 'none';
        }

        /* Body sections */
        _body.innerHTML = '';
        var sections = config.sections || [];

        if (!sections.length) {
            _body.innerHTML = '<div class="dr-placeholder">No details available.</div>';
        } else {
            sections.forEach(function (sec) {
                _body.appendChild(buildSection(sec));
            });
        }

        /* Footer actions */
        _footer.innerHTML = '';
        var actions = config.actions || [];
        actions.forEach(function (act) {
            _footer.appendChild(buildActionBtn(act));
        });

        /* Animate in */
        _backdrop.classList.add('dr-open');
        _panel.classList.add('dr-open');
        _panel.focus();
        _open = true;
    }

    /* ── Close ─────────────────────────────────────────── */

    function close() {
        if (!_panel) return;
        _backdrop.classList.remove('dr-open');
        _panel.classList.remove('dr-open');
        _open = false;
    }

    function isOpen() { return _open; }

    /* ── Section builder ───────────────────────────────── */

    function buildSection(sec) {
        var wrap = document.createElement('div');
        wrap.className = 'dr-section';

        var content = document.createElement('div');
        content.className = 'dr-section-content';

        if (sec.fields && sec.fields.length) {
            content.appendChild(buildFields(sec.fields));
        }

        if (sec.records && sec.records.length) {
            content.appendChild(buildRecords(sec.records));
        }

        if (sec.timeline && sec.timeline.length) {
            content.appendChild(buildTimeline(sec.timeline));
        }

        if (sec.actions && sec.actions.length) {
            var actWrap = document.createElement('div');
            actWrap.className = 'dr-section-actions';
            sec.actions.forEach(function (a) {
                actWrap.appendChild(buildActionBtn(a));
            });
            content.appendChild(actWrap);
        }

        if (sec.collapsible) {
            var detailsEl = document.createElement('details');
            detailsEl.className = 'dr-collapse';
            if (sec.open) {
                detailsEl.setAttribute('open', 'open');
            }
            var summaryEl = document.createElement('summary');
            summaryEl.textContent = sec.heading || 'Details';
            detailsEl.appendChild(summaryEl);
            detailsEl.appendChild(content);
            wrap.appendChild(detailsEl);
            return wrap;
        }

        if (sec.heading) {
            var h = document.createElement('div');
            h.className = 'dr-section-heading';
            h.textContent = sec.heading;
            wrap.appendChild(h);
        }

        wrap.appendChild(content);

        return wrap;
    }

    /* ── Fields ────────────────────────────────────────── */

    function buildFields(fields) {
        var list = document.createElement('div');
        list.className = 'dr-fields';

        fields.forEach(function (f) {
            var row = document.createElement('div');
            row.className = 'dr-field';
            if (f.status) row.classList.add('dr-status-' + f.status);

            var lbl = document.createElement('span');
            lbl.className = 'dr-field-label';
            lbl.textContent = f.label || '';

            var val = document.createElement('span');
            val.className = 'dr-field-value';

            if (f.badge) {
                var b = document.createElement('span');
                b.className = 'dr-badge dr-badge-' + (f.status || 'neutral');
                b.textContent = String(f.value != null ? f.value : '—');
                val.appendChild(b);
            } else {
                val.textContent = String(f.value != null ? f.value : '—');
            }

            row.appendChild(lbl);
            row.appendChild(val);
            list.appendChild(row);
        });

        return list;
    }

    /* ── Records ───────────────────────────────────────── */

    function buildRecords(records) {
        var list = document.createElement('div');
        list.className = 'dr-records';

        records.forEach(function (rec) {
            var el;
            if (rec.href) {
                el = document.createElement('a');
                el.href = rec.href;
            } else {
                el = document.createElement('button');
                el.type = 'button';
                if (rec.onClick) {
                    el.addEventListener('click', rec.onClick);
                }
            }
            el.className = 'dr-record';

            var iconWrap = document.createElement('div');
            iconWrap.className = 'dr-record-icon';
            iconWrap.innerHTML = svg(rec.icon || 'doc');

            var text = document.createElement('div');
            text.className = 'dr-record-text';

            var labelEl = document.createElement('div');
            labelEl.className = 'dr-record-label';
            labelEl.textContent = rec.label || '';

            text.appendChild(labelEl);

            if (rec.meta) {
                var metaEl = document.createElement('div');
                metaEl.className = 'dr-record-meta';
                metaEl.textContent = rec.meta;
                text.appendChild(metaEl);
            }

            var arrow = document.createElement('div');
            arrow.className = 'dr-record-arrow';
            arrow.innerHTML = svg('chevron-right');

            el.appendChild(iconWrap);
            el.appendChild(text);
            el.appendChild(arrow);
            list.appendChild(el);
        });

        return list;
    }

    /* ── Timeline ──────────────────────────────────────── */

    function buildTimeline(entries) {
        var tl = document.createElement('div');
        tl.className = 'dr-timeline';

        entries.forEach(function (e) {
            var entry = document.createElement('div');
            entry.className = 'dr-tl-entry';

            var dot = document.createElement('span');
            dot.className = 'dr-tl-dot dr-tl-' + (e.type || 'info');

            var textEl = document.createElement('span');
            textEl.className = 'dr-tl-text';
            textEl.textContent = e.text || '';

            entry.appendChild(dot);
            entry.appendChild(textEl);

            if (e.time) {
                var timeEl = document.createElement('span');
                timeEl.className = 'dr-tl-time';
                timeEl.textContent = e.time;
                entry.appendChild(timeEl);
            }

            tl.appendChild(entry);
        });

        return tl;
    }

    /* ── Action button ─────────────────────────────────── */

    function buildActionBtn(act) {
        var el;
        if (act.href) {
            el = document.createElement('a');
            el.href = act.href;
        } else {
            el = document.createElement('button');
            el.type = 'button';
        }

        el.className = 'dr-btn ' + (
            act.danger   ? 'dr-btn-danger'    :
            act.primary  ? 'dr-btn-primary'   :
                           'dr-btn-secondary'
        );

        if (act.icon) {
            el.innerHTML = svg(act.icon) + ' ';
        }

        el.appendChild(document.createTextNode(act.label || ''));

        if (act.onClick) {
            el.addEventListener('click', act.onClick);
        }

        return el;
    }

    /* ── SVG icon set ──────────────────────────────────── */

    var ICONS = {
        'close': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        'chevron-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>',
        'driver': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        'truck': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
        'trailer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="1" y="5" width="18" height="12"/><line x1="19" y1="11" x2="23" y2="11"/><circle cx="5" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>',
        'doc': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        'trip': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"/></svg>',
        'alert': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        'defect': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        'edit': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        'external': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
    };

    function svg(name) {
        return ICONS[name] || ICONS['doc'];
    }

    /* ── Export ────────────────────────────────────────── */

    global.Drawer = { open: open, close: close, isOpen: isOpen };

}(typeof window !== 'undefined' ? window : this));
