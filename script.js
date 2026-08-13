/* ════════════════════════════════════════════════
   REMINDERS ENGINE — for workshops registered &
   mentor sessions booked. Stores upcoming reminders
   in localStorage and fires a browser notification
   (falls back to an in-page toast if the user hasn't
   granted Notification permission) when they're due.
   No separate bell widget — reminder status shows
   inline inside the "My Registrations" / "My Bookings"
   panels instead, so there's one less floating UI
   element cluttering the corner.
════════════════════════════════════════════════ */
const REM_KEY = 'lch_reminders';

function remGetAll() {
    try { return JSON.parse(localStorage.getItem(REM_KEY) || '[]'); }
    catch (e) { return []; }
}
function remSaveAll(list) { localStorage.setItem(REM_KEY, JSON.stringify(list)); }

// leadMs: how long before the event to fire the reminder (ms)
function remAdd(title, type, eventDate, leadMs, linkedKey) {
    const list = remGetAll();
    const reminderTime = new Date(eventDate.getTime() - leadMs);
    // replace any existing reminder for the same linkedKey so re-booking/re-registering doesn't duplicate
    const filtered = linkedKey ? list.filter(r => r.linkedKey !== linkedKey) : list;
    const entry = {
        id: 'r' + Date.now() + Math.random().toString(36).slice(2, 7),
        title, type,
        eventTime: eventDate.toISOString(),
        reminderTime: reminderTime.toISOString(),
        leadMs,
        notified: false,
        linkedKey: linkedKey || null
    };
    filtered.push(entry);
    remSaveAll(filtered);
    return entry;
}

function remRemoveByKey(linkedKey) {
    remSaveAll(remGetAll().filter(r => r.linkedKey !== linkedKey));
}

function remFindByKey(linkedKey) {
    return remGetAll().find(r => r.linkedKey === linkedKey) || null;
}

function remLeadLabel(leadMs) {
    if (leadMs >= 86400000) return Math.round(leadMs / 86400000) + ' day before';
    if (leadMs >= 3600000) return Math.round(leadMs / 3600000) + ' hr before';
    return Math.round(leadMs / 60000) + ' min before';
}

function remToast(title, body) {
    let box = document.getElementById('remToastBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'remToastBox';
        box.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9500;display:flex;flex-direction:column;gap:10px;align-items:flex-end';
        document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.style.cssText = 'background:#0c0e1a;color:#fff;padding:14px 18px;border-radius:12px;max-width:300px;box-shadow:0 12px 32px rgba(0,0,0,.3);font-family:Inter,Arial,sans-serif;animation:remToastIn .25s ease';
    t.innerHTML = '<div style="font-weight:700;font-size:13.5px;margin-bottom:4px">🔔 ' + title + '</div><div style="font-size:12.5px;color:#cbd5e1;line-height:1.5">' + body + '</div>';
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 8000);
}

function remFire(r) {
    const label = r.type === 'mentor' ? 'Mentor session starting soon' : 'Workshop starting soon';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(label, { body: r.title }); } catch (e) { remToast(label, r.title); }
    } else {
        remToast(label, r.title);
    }
}

function remCheck() {
    const list = remGetAll();
    const now = Date.now();
    let changed = false;
    list.forEach(r => {
        if (!r.notified && new Date(r.reminderTime).getTime() <= now) {
            remFire(r);
            r.notified = true;
            changed = true;
        }
    });
    // clean up reminders whose event has already fully passed (2hrs grace)
    const kept = list.filter(r => new Date(r.eventTime).getTime() > now - 2 * 60 * 60 * 1000);
    if (changed || kept.length !== list.length) remSaveAll(kept);
}

function remTimeUntil(iso) {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return 'starting now';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return 'in ' + mins + ' min';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return 'in ' + hrs + ' hr' + (hrs > 1 ? 's' : '');
    const days = Math.round(hrs / 24);
    return 'in ' + days + ' day' + (days > 1 ? 's' : '');
}

document.addEventListener('DOMContentLoaded', () => {
    remCheck();
    setInterval(remCheck, 20000);
});
if (document.readyState !== 'loading') { remCheck(); setInterval(remCheck, 20000); }

const remStyle = document.createElement('style');
remStyle.textContent = '@keyframes remToastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}';
document.head.appendChild(remStyle);

/* ════════════════════════════════════════════════
   WORKSHOP REGISTRATION TRACKING — remembers which
   workshops the user has registered for, flips the
   Register button to a "✓ Registered" state, and
   powers the "My Registrations" panel with an
   unregister option.
════════════════════════════════════════════════ */
const WS_KEY = 'lch_registered_workshops';

function wsSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function wsGetAll() {
    try { return JSON.parse(localStorage.getItem(WS_KEY) || '[]'); }
    catch (e) { return []; }
}
function wsSaveAll(list) { localStorage.setItem(WS_KEY, JSON.stringify(list)); }
function wsIsRegistered(key) { return wsGetAll().some(w => w.key === key); }

function wsRegister(entry) {
    const list = wsGetAll();
    if (!list.some(w => w.key === entry.key)) list.push(entry);
    wsSaveAll(list);
    wsRenderPanel();
    if (typeof window.refreshEventTimeline === 'function') window.refreshEventTimeline();
}

function wsUnregister(key) {
    wsSaveAll(wsGetAll().filter(w => w.key !== key));
    remRemoveByKey(key); // also drop any pending reminder tied to this workshop
    wsRenderPanel();
    if (typeof window.refreshEventTimeline === 'function') window.refreshEventTimeline();
}

function wsRenderPanel() {
    const btn = document.getElementById('myRegBtn');
    const panel = document.getElementById('myRegPanel');
    const countEl = document.getElementById('myRegCount');
    if (!btn || !panel || !countEl) return;

    const list = wsGetAll().sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
    countEl.style.display = list.length ? 'flex' : 'none';
    countEl.textContent = list.length;

    if (!list.length) {
        panel.innerHTML =
            '<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;font-weight:800;font-size:16px;padding:14px 16px;border-radius:14px 14px 0 0">📋 My Registrations</div>' +
            '<div style="font-size:14.5px;color:#475569;text-align:center;padding:20px 16px">You haven\'t registered for any workshops yet.</div>';
        return;
    }
    panel.innerHTML =
        '<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;font-weight:800;font-size:16px;padding:14px 16px;border-radius:14px 14px 0 0">📋 My Registrations</div>' +
        '<div style="padding:14px 16px">' +
        list.map(w => {
            const rem = remFindByKey(w.key);
            const remLine = rem
                ? '<div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-top:6px">🔔 Reminder ' + remLeadLabel(rem.leadMs) + '</div>'
                : '';
            return (
                '<div style="background:#fff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin-bottom:10px;position:relative">' +
                '<div style="font-size:15px;font-weight:800;color:#1e3a8a;padding-right:64px;line-height:1.35">' + w.title + '</div>' +
                '<div style="font-size:13.5px;font-weight:600;color:#334155;margin-top:5px">' + w.dateLabel + '</div>' +
                remLine +
                '<button data-ws-unreg="' + w.key + '" style="position:absolute;top:10px;right:8px;background:#fee2e2;color:#b91c1c;border:none;border-radius:7px;padding:5px 10px;font-size:12.5px;font-weight:700;cursor:pointer">Unregister</button>' +
                '</div>'
            );
        }).join('') +
        '</div>';
    panel.querySelectorAll('[data-ws-unreg]').forEach(b => {
        b.addEventListener('click', () => {
            const key = b.getAttribute('data-ws-unreg');
            const w = wsGetAll().find(x => x.key === key);
            if (!w || confirm('Unregister from "' + w.title + '"?')) wsUnregister(key);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wsRenderPanel();
    const btn = document.getElementById('myRegBtn');
    const panel = document.getElementById('myRegPanel');
    if (btn && panel) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!btn.parentElement.contains(e.target)) panel.style.display = 'none';
        });
    }
});
if (document.readyState !== 'loading') { wsRenderPanel(); }

/* ════════════════════════════════════════════════
   MENTOR SESSION BOOKING TRACKING — remembers which
   mentors the user has an active session booked
   with, flips "Book a Session" to a "✓ Booked" state,
   and powers the "My Bookings" panel with a cancel
   option. Mirrors the workshop-registration engine.
════════════════════════════════════════════════ */
const BK_KEY = 'lch_booked_sessions';

function bkSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function bkGetAll() {
    try { return JSON.parse(localStorage.getItem(BK_KEY) || '[]'); }
    catch (e) { return []; }
}
function bkSaveAll(list) { localStorage.setItem(BK_KEY, JSON.stringify(list)); }
function bkIsBooked(key) { return bkGetAll().some(b => b.key === key); }

function bkRegister(entry) {
    const list = bkGetAll().filter(b => b.key !== entry.key); // one active booking per mentor
    list.push(entry);
    bkSaveAll(list);
    bkRenderPanel();
    if (typeof window.refreshMentorButtons === 'function') window.refreshMentorButtons();
}

function bkCancel(key) {
    bkSaveAll(bkGetAll().filter(b => b.key !== key));
    remRemoveByKey(key); // also drop any pending reminder tied to this session
    bkRenderPanel();
    if (typeof window.refreshMentorButtons === 'function') window.refreshMentorButtons();
}

function bkRenderPanel() {
    const btn = document.getElementById('myBookBtn');
    const panel = document.getElementById('myBookPanel');
    const countEl = document.getElementById('myBookCount');
    if (!btn || !panel || !countEl) return;

    const list = bkGetAll().sort((a, b) => new Date(a.bookedAt) - new Date(b.bookedAt));
    countEl.style.display = list.length ? 'flex' : 'none';
    countEl.textContent = list.length;

    if (!list.length) {
        panel.innerHTML =
            '<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;font-weight:800;font-size:16px;padding:14px 16px;border-radius:14px 14px 0 0">👤 My Bookings</div>' +
            '<div style="font-size:14.5px;color:#475569;text-align:center;padding:20px 16px">No mentor sessions booked yet.</div>';
        return;
    }
    panel.innerHTML =
        '<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;font-weight:800;font-size:16px;padding:14px 16px;border-radius:14px 14px 0 0">👤 My Bookings</div>' +
        '<div style="padding:14px 16px">' +
        list.map(b => {
            const rem = remFindByKey(b.key);
            const remLine = rem
                ? '<div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-top:6px">🔔 Reminder ' + remLeadLabel(rem.leadMs) + '</div>'
                : '';
            return (
                '<div style="background:#fff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin-bottom:10px;position:relative">' +
                '<div style="font-size:15px;font-weight:800;color:#1e3a8a;padding-right:74px;line-height:1.35">' + b.mentorName + '</div>' +
                '<div style="font-size:13.5px;font-weight:600;color:#334155;margin-top:5px">' + b.dateText + ' · ' + b.timeText + '</div>' +
                remLine +
                '<button data-bk-cancel="' + b.key + '" style="position:absolute;top:10px;right:8px;background:#fee2e2;color:#b91c1c;border:none;border-radius:7px;padding:5px 10px;font-size:12.5px;font-weight:700;cursor:pointer">Cancel</button>' +
                '</div>'
            );
        }).join('') +
        '</div>';
    panel.querySelectorAll('[data-bk-cancel]').forEach(btnEl => {
        btnEl.addEventListener('click', () => {
            const key = btnEl.getAttribute('data-bk-cancel');
            const b = bkGetAll().find(x => x.key === key);
            if (!b || confirm('Cancel your session with ' + b.mentorName + '?')) bkCancel(key);
        });
    });
}

function bkWireBookButtons() {
    document.querySelectorAll('.btn-book').forEach(btn => {
        const card = btn.closest('.mentor-card');
        if (!card) return;
        const name = card.querySelector('.mentor-name')?.textContent || 'Mentor';
        const key = bkSlug(name);
        if (!btn.dataset.origBg) btn.dataset.origBg = btn.style.background;
        if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
        btn.setAttribute('href', 'javascript:void(0)');

        // clone to strip any previously-attached listeners before re-wiring
        const fresh = btn.cloneNode(true);
        btn.parentNode.replaceChild(fresh, btn);

        if (bkIsBooked(key)) {
            fresh.classList.add('is-booked');
            fresh.style.background = '#eff6ff';
            fresh.textContent = '✓ Booked';
            fresh.addEventListener('mouseenter', () => { fresh.textContent = '✕ Cancel Booking'; });
            fresh.addEventListener('mouseleave', () => { fresh.textContent = '✓ Booked'; });
            fresh.addEventListener('click', e => {
                e.preventDefault();
                if (confirm('Cancel your session with ' + name + '?')) bkCancel(key);
            });
        } else {
            fresh.classList.remove('is-booked');
            fresh.style.background = fresh.dataset.origBg;
            fresh.textContent = fresh.dataset.origText;
            fresh.addEventListener('click', e => { e.preventDefault(); openBookModal(name); });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bkRenderPanel();
    bkWireBookButtons();
    window.refreshMentorButtons = bkWireBookButtons;
    const btn = document.getElementById('myBookBtn');
    const panel = document.getElementById('myBookPanel');
    if (btn && panel) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!btn.parentElement.contains(e.target)) panel.style.display = 'none';
        });
    }
});
if (document.readyState !== 'loading') { bkRenderPanel(); bkWireBookButtons(); window.refreshMentorButtons = bkWireBookButtons; }

const cards = document.querySelectorAll('.testimonial-card');
let current = 0;
const total = cards.length;
const visibleCount = 3;

function showCards() {
    cards.forEach((card) => {
        card.style.display = 'none';
    });
    for (let i = 0; i < visibleCount; i++) {
        const idx = (current + i) % total;
        cards[idx].style.display = 'block';
    }
}

const prevBtn = document.querySelector('#prev');
const nextBtn = document.querySelector('#next');

if (prevBtn && nextBtn && total > 0) {
    prevBtn.addEventListener('click', () => {
        if (current > 0) {
            current = current - 1;
            showCards();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (current < total - visibleCount) {
            current = current + 1;
            showCards();
        }
    });

    showCards();
}
// SCROLL TO TOP
const scrollBtn = document.getElementById('scrollTop');

if (scrollBtn) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            scrollBtn.style.display = 'block';
        } else {
            scrollBtn.style.display = 'none';
        }
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
// ACTIVE NAV
const navLinks = document.querySelectorAll('nav a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});
// COUNTER ANIMATION
function animateCounter(element, target) {
    let count = 0;
    const speed = 50;
    const increment = target / speed;
    
    const timer = setInterval(() => {
        count += increment;
        if (count >= target) {
            element.textContent = target + '+';
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(count) + '+';
        }
    }, 30);
}

// COURSE SEARCH (ALWAYS-VISIBLE SECTION, LIVE FILTER)
// Searches the full course catalog (defined further down this file) and
// links straight to that course's detail view on the Courses page.
const searchInput = document.getElementById('courseSearch');
const searchResults = document.getElementById('searchResults');

function runSearch(query) {
    query = query.trim().toLowerCase();

    if (query === '') {
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
        return;
    }

    const matches = FULL_COURSE_CATALOG.filter(course =>
        course.name.toLowerCase().includes(query) || course.category.toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length > 0) {
        searchResults.innerHTML = matches
            .map(course => {
                const slug = slugForCourse(course.name);
                return `<a href="courses.html?course=${slug}">${course.name}<span class="search-result-cat">${course.category}</span></a>`;
            })
            .join('');
    } else {
        searchResults.innerHTML = '<div class="no-results">No matching courses found</div>';
    }

    searchResults.classList.add('active');
}

if (searchInput) {
    searchInput.addEventListener('input', () => runSearch(searchInput.value));

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    const searchBtn = document.querySelector('.course-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => runSearch(searchInput.value));
    }

    document.querySelectorAll('.search-tag-btn').forEach(tag => {
        tag.addEventListener('click', () => {
            searchInput.value = tag.textContent;
            runSearch(tag.textContent);
            searchInput.focus();
        });
    });
}

// ───────────────────────────────────────────
// WORKSHOPS & EVENTS — month calendar with working prev/next
// ───────────────────────────────────────────
(function initEventsCalendar() {
    const grid = document.getElementById('mpGrid');
    const monthLabel = document.getElementById('mpMonthLabel');
    const prevBtn = document.getElementById('mpPrev');
    const nextBtn = document.getElementById('mpNext');
    const timeline = document.getElementById('eventTimeline');
    if (!grid || !monthLabel || !prevBtn || !nextBtn || !timeline) return;

    const MONTH_NAMES = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];

    // Events keyed by "YYYY-M" (month is 1-12). Add more months here any time —
    // the calendar and timeline pick them up automatically, no other code changes needed.
    const EVENTS_BY_MONTH = {
        '2026-6': [
            {
                days: [3], dateLabel: 'Wed, June 3 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Cracking the Coding Interview: Patterns Over Memorization",
                desc: "A practical look at the recurring patterns behind most DSA interview questions, so you recognise the approach instead of memorising 500 problems.",
                meta: [['👤','Speaker: Karthik Iyer, Freshworks'], ['⏱','75 mins'], ['🎓','All tracks'], ['👥','Free · 600 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [18], dateLabel: 'Thu, June 18 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Git & GitHub for Teams: Branching, PRs, and Code Reviews",
                desc: "Move past `git add . && git commit`. Practice feature branches, resolving merge conflicts, and writing pull requests reviewers actually approve.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','2 hours'], ['🎓','All tracks'], ['👥','Free · 90 seats']],
                registerText: 'Register Free →'
            }
        ],
        '2026-7': [
            {
                days: [7], dateLabel: 'Mon, July 7 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Breaking Into Tech: A Fresher's Roadmap to Your First Job",
                desc: "Industry experts walk through what actually matters in 2026 hiring — skills over degrees, portfolio building, and how to find roles that aren't on job boards.",
                meta: [['👤','Speaker: Arjun Raghavan, Zoho'], ['⏱','90 mins'], ['🎓','All tracks'], ['👥','Free · 800 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [15], dateLabel: 'Tue, July 15 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Hands-On React: Build a Production-Ready Dashboard in 3 Hours",
                desc: "Bring your laptop. We'll build a live data dashboard with React, Recharts, and a real public API — deploy it to Vercel before the session ends.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','3 hours'], ['🎓','Front-End / Full Stack'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [23, 24], dateLabel: 'Wed–Thu, July 23–24 · 48 hrs', color: '#7049e8',
                typeIcon: '⚡', typeLabel: 'Hackathon', typeBg: '#ede8ff', typeColor: '#5b21b6',
                title: "Build.AI Hackathon — Build Something Real With AI APIs",
                desc: "48-hour online hackathon. Build any product using an AI API (OpenAI, HuggingFace, etc.). Top 3 teams win mentorship sessions, swag, and direct referrals to hiring partners.",
                meta: [['🏆','₹25,000 in prizes'], ['👥','Team of 1–3'], ['🎓','AI/ML · Full Stack'], ['🆓','Free entry']],
                registerText: 'Register Team →'
            },
            {
                days: [29], dateLabel: 'Tue, July 29 · 7:00 PM IST', color: '#e83a5f',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#fde4ea', typeColor: '#be123c',
                title: "SQL for Data Analysts: From SELECT to Window Functions in 2 Hours",
                desc: "Practice on real e-commerce datasets. Cover JOINs, subqueries, CTEs, and window functions — the exact queries that show up in data analyst interview rounds.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','2 hours'], ['🎓','Data Analyst'], ['👥','Free · 120 seats']],
                registerText: 'Register Free →'
            }
        ],
        '2026-8': [
            {
                days: [5], dateLabel: 'Wed, August 5 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "REST APIs with Node.js & Express: Build and Deploy in One Sitting",
                desc: "Build a working REST API from scratch — routing, middleware, and a real database — then deploy it live before the session wraps up.",
                meta: [['👤','Instructor: Karthik Iyer, Freshworks'], ['⏱','3 hours'], ['🎓','Back-End / Full Stack'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [19], dateLabel: 'Wed, August 19 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Freelancing vs Full-Time: Choosing Your Path After Certification",
                desc: "A candid panel on income stability, client sourcing, taxes, and how to decide which path fits your first two years after certification.",
                meta: [['👤','Panel: Career Mentors Team'], ['⏱','60 mins'], ['🎓','All tracks'], ['👥','Free · 500 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [27, 28], dateLabel: 'Thu–Fri, August 27–28 · 48 hrs', color: '#7049e8',
                typeIcon: '⚡', typeLabel: 'Hackathon', typeBg: '#ede8ff', typeColor: '#5b21b6',
                title: "Fix-It Hackathon — Ship a Real Open-Source Bug Fix",
                desc: "48-hour online hackathon. Pick a curated open-source issue, submit a real pull request, and get it reviewed live by maintainers.",
                meta: [['🏆','₹20,000 in prizes'], ['👥','Team of 1–2'], ['🎓','All tracks'], ['🆓','Free entry']],
                registerText: 'Register Team →'
            }
        ],
        '2026-9': [
            {
                days: [9], dateLabel: 'Wed, September 9 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Docker & Containers for Beginners: From Zero to Deployed",
                desc: "Package an app into a container, understand images vs containers, and ship it — no prior DevOps experience needed.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','2.5 hours'], ['🎓','Cloud / DevOps'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [22], dateLabel: 'Tue, September 22 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Portfolio Reviews Live: Get Feedback From Hiring Managers",
                desc: "Submit your portfolio ahead of time and get live, on-camera feedback from working hiring managers across product and engineering teams.",
                meta: [['👤','Panel: Hiring Managers'], ['⏱','90 mins'], ['🎓','All tracks'], ['👥','Free · 400 seats']],
                registerText: 'Register Free →'
            }
        ],
        '2026-10': [
            {
                days: [7], dateLabel: 'Wed, October 7 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Python for Automation: Scripting Away Repetitive Work",
                desc: "Write practical Python scripts that automate file handling, web scraping, and reporting tasks — the kind recruiters love seeing in a portfolio.",
                meta: [['👤','Instructor: Karthik Iyer, Freshworks'], ['⏱','2.5 hours'], ['🎓','Programming'], ['👥','₹99 · 70 seats']],
                registerText: 'Register →'
            },
            {
                days: [21, 22], dateLabel: 'Wed–Thu, October 21–22 · 48 hrs', color: '#7049e8',
                typeIcon: '⚡', typeLabel: 'Hackathon', typeBg: '#ede8ff', typeColor: '#5b21b6',
                title: "Data Sprint Hackathon — Turn a Messy Dataset Into an Insight Dashboard",
                desc: "48-hour online hackathon. Clean a real messy dataset, build an analysis, and present an insight dashboard to a panel of working data analysts.",
                meta: [['🏆','₹20,000 in prizes'], ['👥','Team of 1–3'], ['🎓','Data Analyst'], ['🆓','Free entry']],
                registerText: 'Register Team →'
            }
        ],
        '2026-11': [
            {
                days: [11], dateLabel: 'Wed, November 11 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Negotiating Your First Salary: What Freshers Get Wrong",
                desc: "How to research a fair range, respond to a lowball offer, and negotiate beyond just the number — leave, notice period, and joining bonus included.",
                meta: [['👤','Speaker: Career Mentors Team'], ['⏱','60 mins'], ['🎓','All tracks'], ['👥','Free · 550 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [25], dateLabel: 'Wed, November 25 · 10:00 AM IST', color: '#e83a5f',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#fde4ea', typeColor: '#be123c',
                title: "UI/UX Fundamentals: Wireframe to Clickable Prototype in Figma",
                desc: "Design a mobile app screen from scratch in Figma — wireframes, a component system, and a clickable prototype ready to show in interviews.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','3 hours'], ['🎓','UI/UX Design'], ['👥','₹99 · 50 seats']],
                registerText: 'Register →'
            }
        ],
        '2026-12': [
            {
                days: [9], dateLabel: 'Wed, December 9 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Cloud Basics: Deploying Your First App on AWS Free Tier",
                desc: "Set up an EC2 instance, deploy a live app, and understand the handful of AWS services that show up in every entry-level cloud role.",
                meta: [['👤','Instructor: Karthik Iyer, Freshworks'], ['⏱','2.5 hours'], ['🎓','Cloud / DevOps'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [16], dateLabel: 'Wed, December 16 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Year-End Career Reset: Setting a 2027 Learning Plan That Sticks",
                desc: "A guided session on auditing this year's skills gap and setting a realistic, month-by-month learning plan for the year ahead.",
                meta: [['👤','Speaker: Career Mentors Team'], ['⏱','75 mins'], ['🎓','All tracks'], ['👥','Free · 500 seats']],
                registerText: 'Register Free →'
            }
        ],
        '2026-1': [
            {
                days: [14], dateLabel: 'Wed, January 14 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "2026 Tech Hiring Trends: Where the Entry-Level Jobs Actually Are",
                desc: "A data-backed look at which roles, industries, and cities are actually hiring freshers this year — and which skills are moving the needle.",
                meta: [['👤','Speaker: Arjun Raghavan, Zoho'], ['⏱','75 mins'], ['🎓','All tracks'], ['👥','Free · 700 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [28], dateLabel: 'Wed, January 28 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "JavaScript Fundamentals Bootcamp: Closures, Async, and the DOM",
                desc: "A focused half-day on the JS concepts that trip up freshers most — closures, promises/async-await, and real DOM manipulation exercises.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','3 hours'], ['🎓','Front-End'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            }
        ],
        '2026-2': [
            {
                days: [10], dateLabel: 'Tue, February 10 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Mobile App Basics: Your First Cross-Platform App With Flutter",
                desc: "Build and run a simple cross-platform app on both Android and iOS emulators — widgets, state, and navigation covered hands-on.",
                meta: [['👤','Instructor: Karthik Iyer, Freshworks'], ['⏱','3 hours'], ['🎓','Mobile'], ['👥','₹99 · 50 seats']],
                registerText: 'Register →'
            },
            {
                days: [24], dateLabel: 'Tue, February 24 · 6:00 PM IST', color: '#7049e8',
                typeIcon: '⚡', typeLabel: 'Hackathon', typeBg: '#ede8ff', typeColor: '#5b21b6',
                title: "Mini Hack Night — Ship a Working Feature in 4 Hours",
                desc: "A shorter, evening-format hackathon. Pick from three starter briefs and ship a working feature by the end of the night — no team required.",
                meta: [['🏆','₹10,000 in prizes'], ['👥','Solo or team of 2'], ['🎓','All tracks'], ['🆓','Free entry']],
                registerText: 'Register →'
            }
        ],
        '2026-3': [
            {
                days: [11], dateLabel: 'Wed, March 11 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Behavioral Interviews Decoded: Answering With the STAR Method",
                desc: "Turn vague experiences into sharp, structured answers using the STAR method — with live rewrites of real answers submitted by attendees.",
                meta: [['👤','Speaker: Career Mentors Team'], ['⏱','60 mins'], ['🎓','All tracks'], ['👥','Free · 500 seats']],
                registerText: 'Register Free →'
            },
            {
                days: [25, 26], dateLabel: 'Wed–Thu, March 25–26 · 48 hrs', color: '#e83a5f',
                typeIcon: '⚡', typeLabel: 'Hackathon', typeBg: '#fde4ea', typeColor: '#be123c',
                title: "Design.Build Hackathon — From Figma Mockup to Deployed Site",
                desc: "48-hour online hackathon pairing designers and developers. Take a given brief from mockup to a fully deployed, working site.",
                meta: [['🏆','₹22,000 in prizes'], ['👥','Team of 2–3'], ['🎓','Design · Full Stack'], ['🆓','Free entry']],
                registerText: 'Register Team →'
            }
        ],
        '2026-4': [
            {
                days: [8], dateLabel: 'Wed, April 8 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "Intro to Machine Learning: Train Your First Model in Python",
                desc: "Load a real dataset, train and evaluate a basic classification model with scikit-learn, and understand what's actually happening under the hood.",
                meta: [['👤','Instructor: Karthik Iyer, Freshworks'], ['⏱','3 hours'], ['🎓','AI / ML'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [22], dateLabel: 'Wed, April 22 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Cybersecurity Careers 101: Roles, Certifications, and First Steps",
                desc: "An overview of the major cybersecurity career tracks, which certifications are actually worth pursuing first, and how to land your first SOC role.",
                meta: [['👤','Speaker: Vikram Subramaniam'], ['⏱','75 mins'], ['🎓','Cybersecurity'], ['👥','Free · 450 seats']],
                registerText: 'Register Free →'
            }
        ],
        '2026-5': [
            {
                days: [13], dateLabel: 'Wed, May 13 · 10:00 AM IST', color: '#0ab8a0',
                typeIcon: '🔨', typeLabel: 'Workshop', typeBg: '#d0f7f2', typeColor: '#0d9488',
                title: "System Design Basics: Designing a URL Shortener Step by Step",
                desc: "A beginner-friendly walkthrough of system design fundamentals — load balancing, caching, and databases — using a classic interview question.",
                meta: [['👤','Instructor: Priya K, Freshworks'], ['⏱','2.5 hours'], ['🎓','Full Stack'], ['👥','₹99 · 60 seats']],
                registerText: 'Register →'
            },
            {
                days: [27], dateLabel: 'Wed, May 27 · 6:00 PM IST', color: '#3b6bef',
                typeIcon: '🖥️', typeLabel: 'Webinar', typeBg: '#dce9ff', typeColor: '#1d4ed8',
                title: "Building in Public: Growing a Portfolio That Gets Noticed",
                desc: "How to document projects as you build them, write posts that actually get read, and turn a portfolio into inbound opportunities.",
                meta: [['👤','Speaker: Arjun Raghavan, Zoho'], ['⏱','60 mins'], ['🎓','All tracks'], ['👥','Free · 500 seats']],
                registerText: 'Register Free →'
            }
        ]
    };

    const today = new Date();
    let viewYear = today.getFullYear();
    let viewMonth = today.getMonth() + 1; // 1-12

    // Default the calendar to open on the nearest month that actually has events,
    // so first-time visitors don't land on an empty view.
    if (!EVENTS_BY_MONTH[viewYear + '-' + viewMonth]) {
        const keys = Object.keys(EVENTS_BY_MONTH).sort((a, b) => {
            const [ay, am] = a.split('-').map(Number);
            const [by, bm] = b.split('-').map(Number);
            return ay - by || am - bm;
        });
        const todayKey = viewYear + '-' + viewMonth;
        const next = keys.find(k => {
            const [ky, km] = k.split('-').map(Number);
            return ky > viewYear || (ky === viewYear && km >= viewMonth);
        });
        const fallback = next || keys[keys.length - 1];
        if (fallback) {
            const [y, m] = fallback.split('-').map(Number);
            viewYear = y; viewMonth = m;
        }
    }

    function eventsFor(year, month) {
        return EVENTS_BY_MONTH[year + '-' + month] || [];
    }

    function renderCalendar(year, month) {
        grid.querySelectorAll('.mp-day').forEach(el => el.remove());

        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthEvents = eventsFor(year, month);
        const eventDays = new Set();
        monthEvents.forEach(ev => ev.days.forEach(d => eventDays.add(d)));

        const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

        for (let i = 0; i < firstDay; i++) {
            const cell = document.createElement('div');
            cell.className = 'mp-day empty';
            grid.appendChild(cell);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            let cls = 'mp-day';
            if (eventDays.has(d)) cls += ' has-event';
            if (isCurrentMonth && d === today.getDate()) cls += ' today';
            cell.className = cls;
            cell.textContent = d;
            grid.appendChild(cell);
        }
    }

    function renderTimeline(year, month) {
        const monthEvents = eventsFor(year, month);
        timeline.innerHTML = '';

        if (!monthEvents.length) {
            const empty = document.createElement('div');
            empty.className = 'ev-empty';
            empty.innerHTML = '<b>No workshops scheduled this month</b>Use the arrows to browse other months, or check back soon — new sessions are added regularly.';
            timeline.appendChild(empty);
            return;
        }

        const track = document.createElement('div');
        track.className = 'ev-track';

        const VISIBLE_COUNT = 2;
        monthEvents.forEach((ev, idx) => {
            const item = document.createElement('div');
            item.className = 'ev-item' + (idx >= VISIBLE_COUNT ? ' ev-hidden' : '');
            const metaHtml = ev.meta.map(([icon, text]) =>
                `<div class="ev-meta">${icon} <span>${text}</span></div>`
            ).join('');
            item.innerHTML = `
                <div class="ev-dot" style="--ec:${ev.color}"></div>
                <div class="ev-card" style="--ec:${ev.color}">
                    <div class="ev-type-row">
                        <span class="ev-type-badge" style="background:${ev.typeBg};color:${ev.typeColor}">${ev.typeIcon} ${ev.typeLabel}</span>
                        <span class="ev-date-badge">${ev.dateLabel}</span>
                    </div>
                    <div class="ev-title">${ev.title}</div>
                    <div class="ev-desc">${ev.desc}</div>
                    <div class="ev-meta-row">${metaHtml}</div>
                </div>`;
            const card = item.querySelector('.ev-card');
            const wsKey = wsSlug(ev.title);
            const regBtn = document.createElement('a');
            regBtn.href = 'javascript:void(0)';
            regBtn.className = 'ev-register';
            regBtn.dataset.wsKey = wsKey;
            if (wsIsRegistered(wsKey)) {
                regBtn.classList.add('is-registered');
                regBtn.style.background = '#f0fdf4';
                regBtn.textContent = '✓ Registered';
                regBtn.addEventListener('mouseenter', () => { regBtn.textContent = '✕ Unregister'; });
                regBtn.addEventListener('mouseleave', () => { regBtn.textContent = '✓ Registered'; });
                regBtn.addEventListener('click', () => {
                    if (confirm('Unregister from "' + ev.title + '"?')) {
                        wsUnregister(wsKey);
                    }
                });
            } else {
                regBtn.style.background = ev.color;
                regBtn.textContent = ev.registerText;
                regBtn.addEventListener('click', () => openRegisterModal(ev.title, ev.dateLabel, ev.color, year, month, ev.days[0], wsKey));
            }
            card.appendChild(regBtn);
            track.appendChild(item);
        });
        timeline.appendChild(track);

        if (monthEvents.length > VISIBLE_COUNT) {
            const hiddenCount = monthEvents.length - VISIBLE_COUNT;
            const toggle = document.createElement('div');
            toggle.className = 'ev-more-toggle';
            toggle.innerHTML = `<span class="label">Show ${hiddenCount} more</span> <span class="arrow">↓</span>`;
            toggle.addEventListener('click', () => {
                const expanded = toggle.classList.toggle('expanded');
                track.querySelectorAll('.ev-hidden').forEach(el => {
                    el.style.display = expanded ? 'block' : 'none';
                });
                toggle.querySelector('.label').textContent = expanded ? 'Show less' : `Show ${hiddenCount} more`;
            });
            timeline.appendChild(toggle);
        }
    }

    function render() {
        monthLabel.textContent = MONTH_NAMES[viewMonth - 1] + ' ' + viewYear;
        renderCalendar(viewYear, viewMonth);
        renderTimeline(viewYear, viewMonth);
    }

    prevBtn.addEventListener('click', () => {
        viewMonth--;
        if (viewMonth < 1) { viewMonth = 12; viewYear--; }
        render();
    });

    nextBtn.addEventListener('click', () => {
        viewMonth++;
        if (viewMonth > 12) { viewMonth = 1; viewYear++; }
        render();
    });

    render();
    window.refreshEventTimeline = render;
})();

// FAQ ACCORDION — handled by the inline script in faq-contact.html
// (uses answer.scrollHeight so answers are never clipped)
// COURSES PAGE — SHOW MORE PER CATEGORY
document.querySelectorAll('.category-show-more').forEach(wrap => {
    const btn = wrap.querySelector('.show-more-btn');
    const grid = wrap.previousElementSibling;
    if (!btn || !grid) return;

    btn.addEventListener('click', () => {
        const extras = grid.querySelectorAll('.extra-course');
        const expanded = wrap.classList.toggle('expanded');

        extras.forEach(card => {
            card.style.display = expanded ? 'flex' : 'none';
        });

        btn.childNodes[0].textContent = expanded
            ? btn.dataset.lessText + ' '
            : btn.dataset.defaultText + ' ';
    });
});
const filterBtns = document.querySelectorAll('.filter-btn');
const categorySections = document.querySelectorAll('.course-category-section');
const noCoursesMsg = document.getElementById('noCoursesFound');
const courseInterludes = document.querySelectorAll('.course-interlude');

if (filterBtns.length) {
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const category = btn.dataset.filter;
            let visibleCount = 0;

            categorySections.forEach(section => {
                if (category === 'all' || section.dataset.cat === category) {
                    section.style.display = 'block';
                    visibleCount++;
                } else {
                    section.style.display = 'none';
                }
            });

            // Hide interlude banners when filtering to prevent floating
            courseInterludes.forEach(il => {
                il.style.display = category === 'all' ? '' : 'none';
            });

            if (noCoursesMsg) {
                noCoursesMsg.style.display = visibleCount === 0 ? 'block' : 'none';
            }
        });
    });
}

// ───────────────────────────────────────────
// CARD ENHANCEMENTS: icons, level badges, reveals
// ───────────────────────────────────────────
(function initCardEnhancements() {
    var CAT_ICONS = {
        programming: '💻', webdev: '🌐', mobile: '📱',
        ai: '🤖', data: '📊', security: '🔐',
        cloud: '☁️', design: '🎨', business: '📈', certificate: '🏆'
    };

    // Stamp data-level on every level badge
    document.querySelectorAll('.course-level').forEach(function(el) {
        var text = el.textContent.trim();
        if (text) el.setAttribute('data-level', text);
    });

    // Inject category icon into .course-card-img
    document.querySelectorAll('.full-course-card').forEach(function(card) {
        var cat = card.getAttribute('data-category') || '';
        var icon = CAT_ICONS[cat] || '📚';
        var imgWrap = card.querySelector('.course-card-img');
        if (imgWrap && !imgWrap.querySelector('.course-cat-icon')) {
            var iconEl = document.createElement('div');
            iconEl.className = 'course-cat-icon';
            iconEl.textContent = icon;
            imgWrap.appendChild(iconEl);
        }
    });

    // Scroll-reveal with IntersectionObserver
    var cards = document.querySelectorAll('.full-course-card');
    cards.forEach(function(c) { c.classList.add('card-reveal'); });

    if ('IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var siblings = entry.target.parentElement.querySelectorAll('.card-reveal');
                    var idx = Array.prototype.indexOf.call(siblings, entry.target);
                    setTimeout(function() {
                        entry.target.classList.add('revealed');
                    }, Math.min(idx * 70, 280));
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -50px 0px', threshold: 0.06 });
        cards.forEach(function(c) { obs.observe(c); });
    } else {
        cards.forEach(function(c) { c.classList.add('revealed'); });
    }

    // Inject course count badge into each category heading
    document.querySelectorAll('.course-category-section').forEach(function(sec) {
        var h2 = sec.querySelector('.category-heading h2');
        var count = sec.querySelectorAll('.full-course-card').length;
        if (h2 && count && !h2.querySelector('.cat-count-badge')) {
            var badge = document.createElement('span');
            badge.className = 'cat-count-badge';
            badge.style.cssText = 'font-size:0.65rem;font-weight:800;color:#64748b;background:#f1f5f9;border:1.5px solid #e2e8f0;padding:2px 9px;border-radius:99px;margin-left:8px;vertical-align:middle;letter-spacing:0.04em;';
            badge.textContent = count + ' courses';
            h2.appendChild(badge);
        }
    });
})();

// ============================= 
// FULL COURSE CATALOG (visible + extra hidden courses, searchable)
// ============================= 
const FULL_COURSE_CATALOG = [
    // --- Programming ---
    { name: "Python Programming Masterclass", category: "Programming", cardId: null, img: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=120&q=80" },
    { name: "Java Programming Fundamentals", category: "Programming", cardId: null, img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=120&q=80" },
    { name: "C & C++ Foundations", category: "Programming", cardId: null, img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=120&q=80" },
    { name: "JavaScript Essentials", category: "Programming", cardId: null, img: "https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&w=120&q=80" },
    { name: "Go (Golang) for Beginners", category: "Programming", hidden: true, img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=120&q=80&sat=-50" },
    { name: "Rust Programming Crash Course", category: "Programming", hidden: true, img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=120&q=80&sat=-50" },

    // --- Web Development ---
    { name: "Full Stack Web Development", category: "Web Development", cardId: null, img: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=120&q=80" },
    { name: "Frontend Development with React", category: "Web Development", cardId: null, img: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=120&q=80" },
    { name: "Backend Development with Node.js", category: "Web Development", cardId: null, img: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=120&q=80" },
    { name: "Vue.js for Modern Web Apps", category: "Web Development", hidden: true, img: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "WordPress & CMS Development", category: "Web Development", hidden: true, img: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Mobile ---
    { name: "Mobile App Development with Flutter", category: "Mobile Dev", cardId: null, img: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=120&q=80" },
    { name: "iOS App Development with Swift", category: "Mobile Dev", hidden: true, img: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Android Development with Kotlin", category: "Mobile Dev", hidden: true, img: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=120&q=80&sat=-30" },

    // --- AI ---
    { name: "AI & Machine Learning", category: "AI & ML", cardId: null, img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=120&q=80" },
    { name: "Deep Learning & Neural Networks", category: "AI & ML", cardId: null, img: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=120&q=80" },
    { name: "Generative AI & Prompt Engineering", category: "AI & ML", cardId: null, img: "https://images.unsplash.com/photo-1591453089816-0fbb971b454c?auto=format&fit=crop&w=120&q=80" },
    { name: "Natural Language Processing (NLP)", category: "AI & ML", hidden: true, img: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=120&q=80&sat=-30" },
    { name: "Computer Vision Fundamentals", category: "AI & ML", hidden: true, img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=120&q=80&sat=-30" },

    // --- Data ---
    { name: "Data Analytics", category: "Data Science", cardId: null, img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=120&q=80" },
    { name: "Data Science with Python", category: "Data Science", cardId: null, img: "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=120&q=80" },
    { name: "SQL & Database Management", category: "Data Science", hidden: true, img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Power BI & Data Visualization", category: "Data Science", hidden: true, img: "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Security ---
    { name: "Cyber Security", category: "Cyber Security", cardId: null, img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=120&q=80" },
    { name: "Ethical Hacking & Penetration Testing", category: "Cyber Security", cardId: null, img: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=120&q=80" },
    { name: "Network Security Fundamentals", category: "Cyber Security", hidden: true, img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Security Operations (SOC) Analyst", category: "Cyber Security", hidden: true, img: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Cloud ---
    { name: "Cloud Computing with AWS", category: "Cloud & DevOps", cardId: null, img: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=120&q=80" },
    { name: "DevOps & CI/CD Pipelines", category: "Cloud & DevOps", cardId: null, img: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?auto=format&fit=crop&w=120&q=80" },
    { name: "Blockchain Development", category: "Cloud & DevOps", cardId: null, img: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=120&q=80" },
    { name: "Microsoft Azure Fundamentals", category: "Cloud & DevOps", hidden: true, img: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Docker & Kubernetes in Depth", category: "Cloud & DevOps", hidden: true, img: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Design ---
    { name: "UI/UX & Product Design", category: "Design", cardId: null, img: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=120&q=80" },
    { name: "Graphic Design & Branding", category: "Design", cardId: null, img: "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=120&q=80" },
    { name: "Motion Graphics & Video Editing", category: "Design", hidden: true, img: "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Figma for Product Designers", category: "Design", hidden: true, img: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Business ---
    { name: "Digital Marketing Mastery", category: "Business", cardId: null, img: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=120&q=80" },
    { name: "Product Management Essentials", category: "Business", cardId: null, img: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=120&q=80" },
    { name: "Business Analytics & Strategy", category: "Business", hidden: true, img: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "Entrepreneurship & Startups 101", category: "Business", hidden: true, img: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=120&q=80&sat=-40" },

    // --- Certificate ---
    { name: "Full Stack Career Certificate Program", category: "Certificate", cardId: null, img: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=120&q=80" },
    { name: "Data Science Career Certificate Program", category: "Certificate", cardId: null, img: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=120&q=80" },
    { name: "Cyber Security Career Certificate Program", category: "Certificate", hidden: true, img: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=120&q=80&sat=-40" },
    { name: "AI Career Certificate Program", category: "Certificate", hidden: true, img: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=120&q=80&sat=-40" },
];

// NAVBAR SEARCH (searches the FULL catalog — visible + hidden extra courses)
const navSearchToggle = document.getElementById('navbarSearchToggle');
const navSearchWrap = document.getElementById('navbarSearch');
const navSearchInput = document.getElementById('navSearchInput');
const navSearchResults = document.getElementById('navSearchResults');

if (navSearchToggle && navSearchWrap) {
    navSearchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        navSearchWrap.classList.toggle('open');
        if (navSearchWrap.classList.contains('open') && navSearchInput) {
            setTimeout(() => navSearchInput.focus(), 50);
        }
    });

    document.addEventListener('click', (e) => {
        if (!navSearchWrap.contains(e.target)) {
            navSearchWrap.classList.remove('open');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            navSearchWrap.classList.remove('open');
        }
    });
}

function slugForCourse(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function renderNavSearchResults(query) {
    if (!navSearchResults) return;

    if (!query) {
        navSearchResults.innerHTML = '<p class="navbar-search-hint">Try "AI", "Cyber Security", "Full Stack"...</p>';
        return;
    }

    const q = query.toLowerCase();
    const matches = FULL_COURSE_CATALOG.filter(c =>
        c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    ).slice(0, 8);

    if (matches.length === 0) {
        navSearchResults.innerHTML = '<p class="navbar-search-no-results">No courses found for "' + query + '"</p>';
        return;
    }

    navSearchResults.innerHTML = matches.map(c => {
        const slug = slugForCourse(c.name);
        const href = 'courses.html?course=' + slug;
        return '<a class="navbar-search-result" href="' + href + '" data-course-slug="' + slug + '">' +
            '<img class="navbar-search-result-thumb" src="' + c.img + '" alt="" loading="lazy">' +
            '<div class="navbar-search-result-info"><h4>' + c.name + '</h4><span>' + c.category + '</span></div>' +
            '</a>';
    }).join('');
}

if (navSearchInput) {
    renderNavSearchResults('');
    navSearchInput.addEventListener('input', () => renderNavSearchResults(navSearchInput.value.trim()));
}

// On courses.html: handle ?course=slug deep link — reveal hidden cards, expand "show more", scroll + highlight
function handleCourseDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('course');
    if (!slug) return;

    // Expand all "show more" sections so any matching card becomes visible
    document.querySelectorAll('.category-show-more .show-more-btn').forEach(btn => btn.click());

    // Try to find a visible card by matching its heading slug
    const allCards = document.querySelectorAll('.full-course-card');
    let target = null;
    allCards.forEach(card => {
        const h3 = card.querySelector('h3');
        if (h3 && slugForCourse(h3.textContent.trim()) === slug) {
            target = card;
        }
    });

    if (target) {
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('search-highlight');
            setTimeout(() => target.classList.remove('search-highlight'), 1500);
        }, 150);
        return;
    }

    // Not a currently-rendered card — it's a hidden/extra catalog course not in the DOM.
    // Show an inline notice near the filter bar instead.
    const course = FULL_COURSE_CATALOG.find(c => slugForCourse(c.name) === slug);
    const filterBar = document.querySelector('.course-filter-bar');
    if (course && filterBar) {
        const notice = document.createElement('div');
        notice.className = 'no-courses-found';
        notice.style.display = 'block';
        notice.style.maxWidth = '1200px';
        notice.style.margin = '20px auto 0';
        notice.innerHTML = '"' + course.name + '" (' + course.category + ') is opening soon! ' +
            'Talk to our counsellors to get notified the moment enrollment opens.';
        filterBar.insertAdjacentElement('afterend', notice);
    }
}

if (document.querySelector('.course-grid-section')) {
    handleCourseDeepLink();
}

// ---- Stamp data-level attribute on every course level badge for CSS color theming ----
document.querySelectorAll('.course-level').forEach(el => {
    const text = el.textContent.trim();
    if (text) el.setAttribute('data-level', text);
});

const COURSE_DETAILS = [
  {
    "slug": "python-programming-masterclass",
    "name": "Python Programming Masterclass",
    "category": "Programming Fundamentals",
    "categoryKey": "programming",
    "icon": "💻",
    "img": "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "Bestseller",
    "desc": "From basic syntax to OOP, file handling, and mini-projects — the most beginner-friendly way into coding.",
    "rating": "4.8",
    "ratingCount": "3,120 ratings",
    "duration": "2 Months",
    "enrolled": "18,200",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹3,798",
    "monthly": "₹1,899/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Language fundamentals & setup",
      "Control flow & functions",
      "Object-oriented concepts",
      "Data structures & file handling",
      "Mini-projects & code review"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Mohan Krishnan",
      "title": "Senior Software Engineer",
      "exp": "7 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "java-programming-fundamentals",
    "name": "Java Programming Fundamentals",
    "category": "Programming Fundamentals",
    "categoryKey": "programming",
    "icon": "💻",
    "img": "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "New",
    "desc": "Core Java, OOP concepts, collections, and exception handling with hands-on coding exercises.",
    "rating": "4.6",
    "ratingCount": "1,180 ratings",
    "duration": "2 Months",
    "enrolled": "9,400",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹4,198",
    "monthly": "₹2,099/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Language fundamentals & setup",
      "Control flow & functions",
      "Object-oriented concepts",
      "Data structures & file handling",
      "Mini-projects & code review"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Arjun Kapoor",
      "title": "Lead Software Trainer",
      "exp": "6 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "c-c-foundations",
    "name": "C & C++ Foundations",
    "category": "Programming Fundamentals",
    "categoryKey": "programming",
    "icon": "💻",
    "img": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "",
    "desc": "Build a rock-solid base in C/C++ — pointers, memory management, and data structures from scratch.",
    "rating": "4.5",
    "ratingCount": "940 ratings",
    "duration": "2 Months",
    "enrolled": "7,650",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹3,898",
    "monthly": "₹1,949/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Language fundamentals & setup",
      "Control flow & functions",
      "Object-oriented concepts",
      "Data structures & file handling",
      "Mini-projects & code review"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Deepa Mehta",
      "title": "Programming Languages Instructor",
      "exp": "8 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "javascript-essentials",
    "name": "JavaScript Essentials",
    "category": "Programming Fundamentals",
    "categoryKey": "programming",
    "icon": "💻",
    "img": "https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "Trending",
    "desc": "Master JS fundamentals, DOM manipulation, and ES6+ features used in every modern web app.",
    "rating": "4.7",
    "ratingCount": "2,050 ratings",
    "duration": "1 Month",
    "enrolled": "12,300",
    "cert": "Certificate",
    "mrp": "₹3,499",
    "price": "₹1,799",
    "monthly": "₹1,799/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Language fundamentals & setup",
      "Control flow & functions",
      "Object-oriented concepts",
      "Data structures & file handling",
      "Mini-projects & code review"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Ritu Sharma",
      "title": "Programming Languages Instructor",
      "exp": "8 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "full-stack-web-development",
    "name": "Full Stack Web Development",
    "category": "Web Development",
    "categoryKey": "webdev",
    "icon": "🌐",
    "img": "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "Bestseller",
    "desc": "Build and deploy complete web apps using HTML, CSS, JavaScript, React, and Node.js with real projects.",
    "rating": "4.9",
    "ratingCount": "5,230 ratings",
    "duration": "6 Months",
    "enrolled": "21,500",
    "cert": "Certificate",
    "mrp": "₹16,999",
    "price": "₹12,594",
    "monthly": "₹2,099/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "HTML5 & CSS3 fundamentals",
      "JavaScript & DOM manipulation",
      "Frontend framework deep-dive",
      "Backend APIs & databases",
      "Authentication & deployment",
      "Capstone web application"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Preethi Balaji",
      "title": "Full Stack Lead",
      "exp": "8 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "frontend-development-with-react",
    "name": "Frontend Development with React",
    "category": "Web Development",
    "categoryKey": "webdev",
    "icon": "🌐",
    "img": "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "Trending",
    "desc": "Specialize in fast, responsive interfaces using React, component design, and state management.",
    "rating": "4.6",
    "ratingCount": "1,640 ratings",
    "duration": "3 Months",
    "enrolled": "10,800",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹5,697",
    "monthly": "₹1,899/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "HTML5 & CSS3 fundamentals",
      "JavaScript & DOM manipulation",
      "Frontend framework deep-dive",
      "Backend APIs & databases",
      "Authentication & deployment",
      "Capstone web application"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Ashok Patel",
      "title": "Full Stack Lead",
      "exp": "6 yrs",
      "rating": "4.7"
    }
  },
  {
    "slug": "backend-development-with-node-js",
    "name": "Backend Development with Node.js",
    "category": "Web Development",
    "categoryKey": "webdev",
    "icon": "🌐",
    "img": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "New",
    "desc": "Design REST APIs, handle databases, and build scalable backend systems with Node and Express.",
    "rating": "4.5",
    "ratingCount": "820 ratings",
    "duration": "3 Months",
    "enrolled": "6,900",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹6,447",
    "monthly": "₹2,149/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "HTML5 & CSS3 fundamentals",
      "JavaScript & DOM manipulation",
      "Frontend framework deep-dive",
      "Backend APIs & databases",
      "Authentication & deployment",
      "Capstone web application"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Anjali Singh",
      "title": "Full Stack Lead",
      "exp": "6 yrs",
      "rating": "4.5"
    }
  },
  {
    "slug": "mobile-app-development-with-flutter",
    "name": "Mobile App Development with Flutter",
    "category": "Mobile App Development",
    "categoryKey": "mobile",
    "icon": "📱",
    "img": "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "New",
    "desc": "Build cross-platform Android & iOS apps from a single codebase using Flutter and Dart.",
    "rating": "4.6",
    "ratingCount": "610 ratings",
    "duration": "3 Months",
    "enrolled": "5,400",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹5,847",
    "monthly": "₹1,949/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Mobile UI fundamentals",
      "Navigation & state management",
      "Device APIs & local storage",
      "Networking & REST integration",
      "Testing & app store deployment"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Yogesh Reddy",
      "title": "Android Specialist",
      "exp": "6 yrs",
      "rating": "4.9"
    }
  },
  {
    "slug": "ai-machine-learning",
    "name": "AI & Machine Learning",
    "category": "AI & Next-Gen Tech",
    "categoryKey": "ai",
    "icon": "🤖",
    "img": "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "Trending",
    "desc": "Learn Python, data modeling, and ML fundamentals while building real-world AI applications.",
    "rating": "4.8",
    "ratingCount": "3,890 ratings",
    "duration": "5 Months",
    "enrolled": "16,700",
    "cert": "Certificate",
    "mrp": "₹14,999",
    "price": "₹10,495",
    "monthly": "₹2,099/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Python for AI/ML",
      "Data preprocessing & feature engineering",
      "Core model building",
      "Model evaluation & tuning",
      "Real-world project deployment"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Hema Iyer",
      "title": "NLP & LLM Specialist",
      "exp": "7 yrs",
      "rating": "4.8"
    }
  },
  {
    "slug": "deep-learning-neural-networks",
    "name": "Deep Learning & Neural Networks",
    "category": "AI & Next-Gen Tech",
    "categoryKey": "ai",
    "icon": "🤖",
    "img": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=600&q=80",
    "level": "Advanced",
    "ribbon": "Next-Gen",
    "desc": "Go beyond the basics with CNNs, RNNs, computer vision, and NLP on real-world datasets.",
    "rating": "4.7",
    "ratingCount": "1,320 ratings",
    "duration": "4 Months",
    "enrolled": "8,200",
    "cert": "Certificate",
    "mrp": "₹11,999",
    "price": "₹8,796",
    "monthly": "₹2,199/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Python for AI/ML",
      "Data preprocessing & feature engineering",
      "Core model building",
      "Model evaluation & tuning",
      "Real-world project deployment"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Rahul Gupta",
      "title": "Applied AI Engineer",
      "exp": "9 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "generative-ai-prompt-engineering",
    "name": "Generative AI & Prompt Engineering",
    "category": "AI & Next-Gen Tech",
    "categoryKey": "ai",
    "icon": "🤖",
    "img": "https://images.unsplash.com/photo-1591453089816-0fbb971b454c?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "Next-Gen",
    "desc": "Work with LLMs, build AI agents, and design production-grade prompts for real applications.",
    "rating": "4.8",
    "ratingCount": "2,210 ratings",
    "duration": "2 Months",
    "enrolled": "11,900",
    "cert": "Certificate",
    "mrp": "₹6,499",
    "price": "₹3,798",
    "monthly": "₹1,899/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Python for AI/ML",
      "Data preprocessing & feature engineering",
      "Core model building",
      "Model evaluation & tuning",
      "Real-world project deployment"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Nisha Verma",
      "title": "Applied AI Engineer",
      "exp": "6 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "data-analytics",
    "name": "Data Analytics",
    "category": "Data Science & Analytics",
    "categoryKey": "data",
    "icon": "📊",
    "img": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "Bestseller",
    "desc": "Work with real datasets to learn SQL, Excel, Power BI, and Python for business reporting.",
    "rating": "4.7",
    "ratingCount": "2,680 ratings",
    "duration": "3 Months",
    "enrolled": "13,400",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹6,147",
    "monthly": "₹2,049/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "SQL & data wrangling",
      "Excel & Power BI dashboards",
      "Statistics for analytics",
      "Python for data analysis",
      "Business reporting capstone"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Meera Nambiar",
      "title": "Data Science Trainer",
      "exp": "9 yrs",
      "rating": "4.7"
    }
  },
  {
    "slug": "data-science-with-python",
    "name": "Data Science with Python",
    "category": "Data Science & Analytics",
    "categoryKey": "data",
    "icon": "📊",
    "img": "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "",
    "desc": "Combine statistics, Python, and visualization tools to extract insights and build data-driven solutions.",
    "rating": "4.6",
    "ratingCount": "1,450 ratings",
    "duration": "4 Months",
    "enrolled": "9,100",
    "cert": "Certificate",
    "mrp": "₹11,999",
    "price": "₹7,796",
    "monthly": "₹1,949/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "SQL & data wrangling",
      "Excel & Power BI dashboards",
      "Statistics for analytics",
      "Python for data analysis",
      "Business reporting capstone"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Pradeep Sharma",
      "title": "Lead Data Analyst",
      "exp": "8 yrs",
      "rating": "4.7"
    }
  },
  {
    "slug": "cyber-security",
    "name": "Cyber Security",
    "category": "Cyber Security",
    "categoryKey": "security",
    "icon": "🔒",
    "img": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "",
    "desc": "Master network defense, security auditing, and incident response through hands-on labs.",
    "rating": "4.8",
    "ratingCount": "1,390 ratings",
    "duration": "4 Months",
    "enrolled": "7,800",
    "cert": "Certificate",
    "mrp": "₹11,999",
    "price": "₹8,596",
    "monthly": "₹2,149/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Networking & security fundamentals",
      "Threat modeling & vulnerabilities",
      "Hands-on penetration testing labs",
      "Security tools & frameworks",
      "Incident response capstone"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Pooja Bose",
      "title": "Security Operations Lead",
      "exp": "6 yrs",
      "rating": "4.7"
    }
  },
  {
    "slug": "ethical-hacking-penetration-testing",
    "name": "Ethical Hacking & Penetration Testing",
    "category": "Cyber Security",
    "categoryKey": "security",
    "icon": "🔒",
    "img": "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=600&q=80",
    "level": "Advanced",
    "ribbon": "Trending",
    "desc": "Learn vulnerability assessment and pen-testing techniques used by security professionals.",
    "rating": "4.7",
    "ratingCount": "980 ratings",
    "duration": "3 Months",
    "enrolled": "6,500",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹5,997",
    "monthly": "₹1,999/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Networking & security fundamentals",
      "Threat modeling & vulnerabilities",
      "Hands-on penetration testing labs",
      "Security tools & frameworks",
      "Incident response capstone"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Tarun Khanna",
      "title": "Security Operations Lead",
      "exp": "7 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "cloud-computing-with-aws",
    "name": "Cloud Computing with AWS",
    "category": "Cloud, DevOps & Blockchain",
    "categoryKey": "cloud",
    "icon": "☁️",
    "img": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "Next-Gen",
    "desc": "Deploy, scale, and manage applications on AWS — the most in-demand cloud skill today.",
    "rating": "4.7",
    "ratingCount": "1,510 ratings",
    "duration": "3 Months",
    "enrolled": "8,900",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹6,297",
    "monthly": "₹2,099/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Cloud fundamentals & architecture",
      "Core platform services",
      "CI/CD pipelines & automation",
      "Containers & orchestration",
      "Production deployment project"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Meenakshi Joshi",
      "title": "Cloud Architect, AWS Certified",
      "exp": "6 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "devops-ci-cd-pipelines",
    "name": "DevOps & CI/CD Pipelines",
    "category": "Cloud, DevOps & Blockchain",
    "categoryKey": "cloud",
    "icon": "☁️",
    "img": "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?auto=format&fit=crop&w=600&q=80",
    "level": "Advanced",
    "ribbon": "New",
    "desc": "Automate builds and deployments using Docker, Kubernetes, Jenkins, and Git workflows.",
    "rating": "4.6",
    "ratingCount": "560 ratings",
    "duration": "3 Months",
    "enrolled": "4,700",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹6,597",
    "monthly": "₹2,199/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Cloud fundamentals & architecture",
      "Core platform services",
      "CI/CD pipelines & automation",
      "Containers & orchestration",
      "Production deployment project"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Kavitha Rao",
      "title": "Cloud & DevOps Trainer",
      "exp": "5 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "blockchain-development",
    "name": "Blockchain Development",
    "category": "Cloud, DevOps & Blockchain",
    "categoryKey": "cloud",
    "icon": "☁️",
    "img": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=600&q=80",
    "level": "Advanced",
    "ribbon": "Next-Gen",
    "desc": "Understand smart contracts, Web3, and decentralized apps — build on Ethereum from scratch.",
    "rating": "4.5",
    "ratingCount": "410 ratings",
    "duration": "3 Months",
    "enrolled": "3,200",
    "cert": "Certificate",
    "mrp": "₹8,999",
    "price": "₹6,747",
    "monthly": "₹2,249/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Cloud fundamentals & architecture",
      "Core platform services",
      "CI/CD pipelines & automation",
      "Containers & orchestration",
      "Production deployment project"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Naveen Kumar",
      "title": "Cloud & DevOps Trainer",
      "exp": "8 yrs",
      "rating": "4.6"
    }
  },
  {
    "slug": "ui-ux-product-design",
    "name": "UI/UX & Product Design",
    "category": "Design",
    "categoryKey": "design",
    "icon": "🎨",
    "img": "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "",
    "desc": "Design user-friendly digital products from research to high-fidelity prototypes using Figma.",
    "rating": "4.7",
    "ratingCount": "1,920 ratings",
    "duration": "4 Months",
    "enrolled": "10,600",
    "cert": "Certificate",
    "mrp": "₹11,999",
    "price": "₹7,596",
    "monthly": "₹1,899/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Design fundamentals & theory",
      "Tools deep-dive (Figma/Adobe)",
      "Wireframing & prototyping",
      "User research & testing",
      "Portfolio capstone project"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Indira Natarajan",
      "title": "UI/UX Designer & Mentor",
      "exp": "8 yrs",
      "rating": "4.8"
    }
  },
  {
    "slug": "graphic-design-branding",
    "name": "Graphic Design & Branding",
    "category": "Design",
    "categoryKey": "design",
    "icon": "🎨",
    "img": "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "",
    "desc": "Learn visual design, branding, and Adobe tools to create logos and marketing creatives.",
    "rating": "4.6",
    "ratingCount": "780 ratings",
    "duration": "2 Months",
    "enrolled": "6,300",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹4,098",
    "monthly": "₹2,049/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Design fundamentals & theory",
      "Tools deep-dive (Figma/Adobe)",
      "Wireframing & prototyping",
      "User research & testing",
      "Portfolio capstone project"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Siddharth Malhotra",
      "title": "UI/UX Designer & Mentor",
      "exp": "8 yrs",
      "rating": "4.5"
    }
  },
  {
    "slug": "digital-marketing-mastery",
    "name": "Digital Marketing Mastery",
    "category": "Business & Marketing",
    "categoryKey": "business",
    "icon": "📈",
    "img": "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=600&q=80",
    "level": "Beginner",
    "ribbon": "New",
    "desc": "SEO, social media, paid ads, and analytics — everything to run a modern marketing campaign.",
    "rating": "4.6",
    "ratingCount": "1,340 ratings",
    "duration": "2 Months",
    "enrolled": "9,800",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹4,398",
    "monthly": "₹2,199/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "No prior experience required",
    "curriculum": [
      "Core concepts & strategy",
      "Tools & frameworks",
      "Real-world case studies",
      "Hands-on campaign/project work",
      "Capstone presentation"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Priya Chatterjee",
      "title": "Digital Marketing Lead",
      "exp": "5 yrs",
      "rating": "4.7"
    }
  },
  {
    "slug": "product-management-essentials",
    "name": "Product Management Essentials",
    "category": "Business & Marketing",
    "categoryKey": "business",
    "icon": "📈",
    "img": "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80",
    "level": "Intermediate",
    "ribbon": "",
    "desc": "Learn roadmapping, stakeholder communication, and agile delivery for tech products.",
    "rating": "4.5",
    "ratingCount": "390 ratings",
    "duration": "2 Months",
    "enrolled": "4,100",
    "cert": "Certificate",
    "mrp": "₹5,999",
    "price": "₹3,598",
    "monthly": "₹1,799/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Basic programming knowledge recommended",
    "curriculum": [
      "Core concepts & strategy",
      "Tools & frameworks",
      "Real-world case studies",
      "Hands-on campaign/project work",
      "Capstone presentation"
    ],
    "placement": "Project certification + career guidance access",
    "faculty": {
      "name": "Anita Desai",
      "title": "Growth & Strategy Consultant",
      "exp": "8 yrs",
      "rating": "4.8"
    }
  },
  {
    "slug": "full-stack-career-certificate-program",
    "name": "Full Stack Career Certificate Program",
    "category": "Certificate & Job-Ready Programs",
    "categoryKey": "certificate",
    "icon": "🎓",
    "img": "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80",
    "level": "Job-Ready",
    "ribbon": "Bestseller",
    "desc": "An intensive, placement-focused track combining web development, projects, and interview prep.",
    "rating": "4.9",
    "ratingCount": "1,870 ratings",
    "duration": "9 Months",
    "enrolled": "5,600",
    "cert": "Certificate",
    "mrp": "₹24,999",
    "price": "₹17,991",
    "monthly": "₹1,999/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Foundations & core skills",
      "Specialization modules",
      "Real-world client-style projects",
      "Mock interviews & resume prep",
      "Capstone + placement support"
    ],
    "placement": "Resume building, mock interviews & job referrals included",
    "faculty": {
      "name": "Geeta Kapoor",
      "title": "Capstone Project Mentor",
      "exp": "7 yrs",
      "rating": "4.8"
    }
  },
  {
    "slug": "data-science-career-certificate-program",
    "name": "Data Science Career Certificate Program",
    "category": "Certificate & Job-Ready Programs",
    "categoryKey": "certificate",
    "icon": "🎓",
    "img": "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80",
    "level": "Job-Ready",
    "ribbon": "Trending",
    "desc": "End-to-end certification track in data analytics, ML, and capstone projects with placement support.",
    "rating": "4.8",
    "ratingCount": "1,240 ratings",
    "duration": "8 Months",
    "enrolled": "4,300",
    "cert": "Certificate",
    "mrp": "₹21,999",
    "price": "₹16,392",
    "monthly": "₹2,049/mo",
    "mode": "Live Online + In-person (Madurai)",
    "language": "English & Tamil",
    "batch": "New batch starts every 2 weeks",
    "prerequisites": "Prior course/project experience recommended",
    "curriculum": [
      "Foundations & core skills",
      "Specialization modules",
      "Real-world client-style projects",
      "Mock interviews & resume prep",
      "Capstone + placement support"
    ],
    "placement": "Resume building, mock interviews & job referrals included",
    "faculty": {
      "name": "Tarun Menon",
      "title": "Capstone Project Mentor",
      "exp": "7 yrs",
      "rating": "4.6"
    }
  }
];

const FACULTY_DATA = {
  "python-programming-masterclass": [
    {
      "name": "Mohan Krishnan",
      "title": "Senior Software Engineer",
      "background": "Ex-Infosys · 7 yrs industry experience",
      "research": "Shipped 4 consumer products end-to-end",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "2,300+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Uma Jagan",
      "title": "Software Development Mentor",
      "background": "Ex-Mindtree · 8 yrs industry experience",
      "research": "Contributor to open-source Python tooling",
      "teachingRating": 4.5,
      "courseRating": 4.5,
      "students": "2,900+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Bhavna Shetty",
      "title": "Lead Software Trainer",
      "background": "Ex-Cognizant · 7 yrs industry experience",
      "research": "Shipped 4 consumer products end-to-end",
      "teachingRating": 4.8,
      "courseRating": 4.8,
      "students": "3,700+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "java-programming-fundamentals": [
    {
      "name": "Arjun Kapoor",
      "title": "Lead Software Trainer",
      "background": "Ex-Cognizant · 6 yrs industry experience",
      "research": "Automated reporting pipelines saving 100+ hrs/month",
      "teachingRating": 4.8,
      "courseRating": 4.6,
      "students": "2,600+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Rajesh Babu",
      "title": "Senior Software Engineer",
      "background": "Ex-Infosys · 6 yrs industry experience",
      "research": "Built 3 internal developer-training programs",
      "teachingRating": 4.5,
      "courseRating": 4.5,
      "students": "3,400+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "c-c-foundations": [
    {
      "name": "Deepa Mehta",
      "title": "Programming Languages Instructor",
      "background": "Ex-TCS · 8 yrs industry experience",
      "research": "Published app performance benchmarking toolkit",
      "teachingRating": 4.5,
      "courseRating": 4.6,
      "students": "5,100+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Rohan Nair",
      "title": "Senior Software Engineer",
      "background": "Ex-Infosys · 6 yrs industry experience",
      "research": "Speaker at 3 regional React meetups",
      "teachingRating": 4.5,
      "courseRating": 4.6,
      "students": "3,100+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "javascript-essentials": [
    {
      "name": "Ritu Sharma",
      "title": "Programming Languages Instructor",
      "background": "Ex-TCS · 8 yrs industry experience",
      "research": "Reviewed 300+ capstone projects for industry-readiness",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "5,100+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Tarun Narayanan",
      "title": "Lead Software Trainer",
      "background": "Ex-Cognizant · 6 yrs industry experience",
      "research": "Built infra-as-code templates reused across 12 teams",
      "teachingRating": 4.7,
      "courseRating": 4.6,
      "students": "5,600+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Ramesh Nair",
      "title": "Backend Engineer & Educator",
      "background": "Ex-Freshworks · 8 yrs industry experience",
      "research": "Certified Power BI & Tableau specialist",
      "teachingRating": 4.6,
      "courseRating": 4.9,
      "students": "5,600+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "full-stack-web-development": [
    {
      "name": "Preethi Balaji",
      "title": "Full Stack Lead",
      "background": "Ex-Zoho · 8 yrs industry experience",
      "research": "Reviewed 300+ capstone projects for industry-readiness",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "4,800+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Divya Babu",
      "title": "Frontend Architect",
      "background": "Ex-Swiggy · 9 yrs industry experience",
      "research": "Authored a popular open-source UI library",
      "teachingRating": 4.7,
      "courseRating": 4.9,
      "students": "4,100+",
      "exp": "9 yrs",
      "trial": true
    },
    {
      "name": "Rupa Joshi",
      "title": "UI Engineering Lead",
      "background": "Ex-CRED · 7 yrs industry experience",
      "research": "Shipped 4 consumer products end-to-end",
      "teachingRating": 4.8,
      "courseRating": 4.7,
      "students": "5,600+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Krishnan Chari",
      "title": "Web Platform Engineer",
      "background": "Ex-Freshworks · 8 yrs industry experience",
      "research": "Led migration of 2 production apps to microservices",
      "teachingRating": 4.6,
      "courseRating": 4.9,
      "students": "2,600+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "frontend-development-with-react": [
    {
      "name": "Ashok Patel",
      "title": "Full Stack Lead",
      "background": "Ex-Zoho · 6 yrs industry experience",
      "research": "Grew organic traffic 5x for 6 D2C brands",
      "teachingRating": 4.8,
      "courseRating": 4.7,
      "students": "2,300+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Arvind Saxena",
      "title": "UI Engineering Lead",
      "background": "Ex-CRED · 9 yrs industry experience",
      "research": "Built component library adopted by 4 product teams",
      "teachingRating": 4.7,
      "courseRating": 4.9,
      "students": "2,100+",
      "exp": "9 yrs",
      "trial": true
    },
    {
      "name": "Balaji Narayanan",
      "title": "Web Platform Engineer",
      "background": "Ex-Freshworks · 7 yrs industry experience",
      "research": "Built infra-as-code templates reused across 12 teams",
      "teachingRating": 4.8,
      "courseRating": 4.6,
      "students": "3,100+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "backend-development-with-node-js": [
    {
      "name": "Anjali Singh",
      "title": "Full Stack Lead",
      "background": "Ex-Zoho · 6 yrs industry experience",
      "research": "Portfolio reviewed 500+ student case studies",
      "teachingRating": 4.7,
      "courseRating": 4.5,
      "students": "5,100+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Pradeep Nair",
      "title": "Full Stack Engineer",
      "background": "Ex-Razorpay · 7 yrs industry experience",
      "research": "Grew organic traffic 5x for 6 D2C brands",
      "teachingRating": 4.6,
      "courseRating": 4.8,
      "students": "4,500+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "mobile-app-development-with-flutter": [
    {
      "name": "Yogesh Reddy",
      "title": "Android Specialist",
      "background": "Ex-Practo · 6 yrs industry experience",
      "research": "Designed coding bootcamp curriculum for 500+ students",
      "teachingRating": 4.9,
      "courseRating": 4.9,
      "students": "6,800+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Sangeeta Mishra",
      "title": "iOS & Flutter Developer",
      "background": "Ex-PhonePe · 7 yrs industry experience",
      "research": "Built component library adopted by 4 product teams",
      "teachingRating": 4.9,
      "courseRating": 4.9,
      "students": "2,300+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Meera Babu",
      "title": "Mobile Engineering Lead",
      "background": "Ex-Ola · 6 yrs industry experience",
      "research": "Designed branding for 30+ startups",
      "teachingRating": 4.6,
      "courseRating": 4.7,
      "students": "4,500+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "ai-machine-learning": [
    {
      "name": "Hema Iyer",
      "title": "NLP & LLM Specialist",
      "background": "Ex-Sprinklr · 7 yrs industry experience",
      "research": "Azure & AWS dual-certified trainer",
      "teachingRating": 4.7,
      "courseRating": 4.8,
      "students": "3,400+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Shankar Pillai",
      "title": "Deep Learning Engineer",
      "background": "Ex-NVIDIA · 6 yrs industry experience",
      "research": "Built production NLP pipelines at scale",
      "teachingRating": 4.6,
      "courseRating": 4.5,
      "students": "2,100+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Nikhil Banerjee",
      "title": "ML Researcher, PhD (AI)",
      "background": "Published researcher · 7 yrs industry experience",
      "research": "Built 3 internal developer-training programs",
      "teachingRating": 4.5,
      "courseRating": 4.8,
      "students": "2,100+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Shilpa Agarwal",
      "title": "Data Scientist & ML Trainer",
      "background": "Ex-Mu Sigma · 8 yrs industry experience",
      "research": "Built component library adopted by 4 product teams",
      "teachingRating": 4.5,
      "courseRating": 4.6,
      "students": "5,100+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "deep-learning-neural-networks": [
    {
      "name": "Rahul Gupta",
      "title": "Applied AI Engineer",
      "background": "Ex-Google AI resident · 9 yrs industry experience",
      "research": "Reduced deployment time 70% via CI/CD redesign",
      "teachingRating": 4.8,
      "courseRating": 4.6,
      "students": "2,300+",
      "exp": "9 yrs",
      "trial": true
    },
    {
      "name": "Sanjay Rajan",
      "title": "Deep Learning Engineer",
      "background": "Ex-NVIDIA · 8 yrs industry experience",
      "research": "Designed secure-code review checklist used company-wide",
      "teachingRating": 4.7,
      "courseRating": 4.8,
      "students": "5,100+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Rohit Anand",
      "title": "ML Researcher, PhD (AI)",
      "background": "Published researcher · 8 yrs industry experience",
      "research": "Azure & AWS dual-certified trainer",
      "teachingRating": 4.8,
      "courseRating": 4.5,
      "students": "2,900+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "generative-ai-prompt-engineering": [
    {
      "name": "Nisha Verma",
      "title": "Applied AI Engineer",
      "background": "Ex-Google AI resident · 6 yrs industry experience",
      "research": "Speaker at 3 regional React meetups",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "2,300+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Lakshmi Narayanan",
      "title": "Deep Learning Engineer",
      "background": "Ex-NVIDIA · 5 yrs industry experience",
      "research": "Kaggle Expert, top 1% in 3 competitions",
      "teachingRating": 4.8,
      "courseRating": 4.7,
      "students": "2,100+",
      "exp": "5 yrs",
      "trial": true
    }
  ],
  "data-analytics": [
    {
      "name": "Meera Nambiar",
      "title": "Data Science Trainer",
      "background": "Ex-Flipkart · 9 yrs industry experience",
      "research": "Published 2 papers on compiler optimization",
      "teachingRating": 4.6,
      "courseRating": 4.7,
      "students": "2,100+",
      "exp": "9 yrs",
      "trial": true
    },
    {
      "name": "Geeta Kulkarni",
      "title": "Analytics Engineer",
      "background": "Ex-Myntra · 8 yrs industry experience",
      "research": "Advised 15+ early-stage startups on GTM strategy",
      "teachingRating": 4.6,
      "courseRating": 4.8,
      "students": "4,100+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Roopa Sastry",
      "title": "Business Intelligence Lead",
      "background": "Ex-Wipro · 9 yrs industry experience",
      "research": "Built component library adopted by 4 product teams",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "2,100+",
      "exp": "9 yrs",
      "trial": true
    }
  ],
  "data-science-with-python": [
    {
      "name": "Pradeep Sharma",
      "title": "Lead Data Analyst",
      "background": "Ex-TCS · 8 yrs industry experience",
      "research": "Designed coding bootcamp curriculum for 500+ students",
      "teachingRating": 4.5,
      "courseRating": 4.7,
      "students": "4,500+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Shreya Pandian",
      "title": "Business Intelligence Lead",
      "background": "Ex-Wipro · 6 yrs industry experience",
      "research": "Built developer docs used by 10k+ devs",
      "teachingRating": 4.8,
      "courseRating": 4.5,
      "students": "2,300+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "cyber-security": [
    {
      "name": "Pooja Bose",
      "title": "Security Operations Lead",
      "background": "Ex-Paytm · 6 yrs industry experience",
      "research": "PhD in Machine Learning, 5 peer-reviewed papers",
      "teachingRating": 4.7,
      "courseRating": 4.7,
      "students": "4,500+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Anita Khanna",
      "title": "Network Security Trainer",
      "background": "Ex-HCL · 8 yrs industry experience",
      "research": "Certified Power BI & Tableau specialist",
      "teachingRating": 4.6,
      "courseRating": 4.7,
      "students": "5,100+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Sanjay Venkatesh",
      "title": "Cyber Security Consultant, CEH",
      "background": "Independent consultant · 6 yrs industry experience",
      "research": "Built component library adopted by 4 product teams",
      "teachingRating": 4.5,
      "courseRating": 4.7,
      "students": "4,800+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "ethical-hacking-penetration-testing": [
    {
      "name": "Tarun Khanna",
      "title": "Security Operations Lead",
      "background": "Ex-Paytm · 7 yrs industry experience",
      "research": "Built BI dashboards used by 200+ analysts",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "2,300+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Sudha Mani",
      "title": "Network Security Trainer",
      "background": "Ex-HCL · 6 yrs industry experience",
      "research": "Designed branding for 30+ startups",
      "teachingRating": 4.7,
      "courseRating": 4.7,
      "students": "3,100+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "cloud-computing-with-aws": [
    {
      "name": "Meenakshi Joshi",
      "title": "Cloud Architect, AWS Certified",
      "background": "Ex-Zoho · 6 yrs industry experience",
      "research": "Advised 15+ early-stage startups on GTM strategy",
      "teachingRating": 4.9,
      "courseRating": 4.6,
      "students": "2,300+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Mahesh Balaji",
      "title": "Cloud & DevOps Trainer",
      "background": "Ex-Accenture · 6 yrs industry experience",
      "research": "Built mentor-matching framework for capstone projects",
      "teachingRating": 4.6,
      "courseRating": 4.7,
      "students": "5,600+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Laxmi Patil",
      "title": "Site Reliability Engineer",
      "background": "Ex-Flipkart · 7 yrs industry experience",
      "research": "Reduced deployment time 70% via CI/CD redesign",
      "teachingRating": 4.7,
      "courseRating": 4.6,
      "students": "2,100+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "devops-ci-cd-pipelines": [
    {
      "name": "Kavitha Rao",
      "title": "Cloud & DevOps Trainer",
      "background": "Ex-Accenture · 5 yrs industry experience",
      "research": "Azure & AWS dual-certified trainer",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "3,100+",
      "exp": "5 yrs",
      "trial": true
    },
    {
      "name": "Harish Rajendran",
      "title": "Cloud Architect, AWS Certified",
      "background": "Ex-Zoho · 8 yrs industry experience",
      "research": "Built 3 internal developer-training programs",
      "teachingRating": 4.7,
      "courseRating": 4.5,
      "students": "5,600+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "blockchain-development": [
    {
      "name": "Naveen Kumar",
      "title": "Cloud & DevOps Trainer",
      "background": "Ex-Accenture · 8 yrs industry experience",
      "research": "PhD in Machine Learning, 5 peer-reviewed papers",
      "teachingRating": 4.6,
      "courseRating": 4.6,
      "students": "6,800+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Indira Kannan",
      "title": "DevOps Engineer",
      "background": "Ex-Freshworks · 7 yrs industry experience",
      "research": "Shipped 4 apps with 100k+ downloads",
      "teachingRating": 4.8,
      "courseRating": 4.6,
      "students": "4,500+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "ui-ux-product-design": [
    {
      "name": "Indira Natarajan",
      "title": "UI/UX Designer & Mentor",
      "background": "Ex-CRED · 8 yrs industry experience",
      "research": "Kaggle Expert, top 1% in 3 competitions",
      "teachingRating": 4.5,
      "courseRating": 4.8,
      "students": "3,400+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Rahul Chandra",
      "title": "Product Design Lead",
      "background": "Ex-Swiggy · 7 yrs industry experience",
      "research": "Built production NLP pipelines at scale",
      "teachingRating": 4.6,
      "courseRating": 4.8,
      "students": "3,700+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Nikhil Nair",
      "title": "Visual & Brand Designer",
      "background": "Freelance · 7 yrs industry experience",
      "research": "Contributor to open-source Python tooling",
      "teachingRating": 4.8,
      "courseRating": 4.7,
      "students": "3,100+",
      "exp": "7 yrs",
      "trial": true
    }
  ],
  "graphic-design-branding": [
    {
      "name": "Siddharth Malhotra",
      "title": "UI/UX Designer & Mentor",
      "background": "Ex-CRED · 8 yrs industry experience",
      "research": "Reviewed 300+ capstone projects for industry-readiness",
      "teachingRating": 4.6,
      "courseRating": 4.5,
      "students": "6,800+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Priya Menon",
      "title": "Design Systems Specialist",
      "background": "Ex-Razorpay · 8 yrs industry experience",
      "research": "Built computer-vision models for retail clients",
      "teachingRating": 4.8,
      "courseRating": 4.8,
      "students": "3,400+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "digital-marketing-mastery": [
    {
      "name": "Priya Chatterjee",
      "title": "Digital Marketing Lead",
      "background": "Ex-Byju's · 5 yrs industry experience",
      "research": "Grew organic traffic 5x for 6 D2C brands",
      "teachingRating": 4.5,
      "courseRating": 4.7,
      "students": "5,600+",
      "exp": "5 yrs",
      "trial": true
    },
    {
      "name": "Naveen Pillai",
      "title": "Product Management Trainer",
      "background": "Ex-Ola · 6 yrs industry experience",
      "research": "Reduced deployment time 70% via CI/CD redesign",
      "teachingRating": 4.7,
      "courseRating": 4.7,
      "students": "3,100+",
      "exp": "6 yrs",
      "trial": true
    },
    {
      "name": "Kiran Joseph",
      "title": "Brand & Performance Marketer",
      "background": "Ex-Nykaa · 5 yrs industry experience",
      "research": "Reduced deployment time 70% via CI/CD redesign",
      "teachingRating": 4.7,
      "courseRating": 4.8,
      "students": "5,100+",
      "exp": "5 yrs",
      "trial": true
    }
  ],
  "product-management-essentials": [
    {
      "name": "Anita Desai",
      "title": "Growth & Strategy Consultant",
      "background": "Independent consultant · 8 yrs industry experience",
      "research": "Designed analytics curriculum for 2 bootcamps",
      "teachingRating": 4.7,
      "courseRating": 4.8,
      "students": "2,300+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Pooja Subramaniam",
      "title": "Product Management Trainer",
      "background": "Ex-Ola · 8 yrs industry experience",
      "research": "Architected multi-region AWS deployments",
      "teachingRating": 4.6,
      "courseRating": 4.8,
      "students": "4,500+",
      "exp": "8 yrs",
      "trial": true
    }
  ],
  "full-stack-career-certificate-program": [
    {
      "name": "Geeta Kapoor",
      "title": "Capstone Project Mentor",
      "background": "Senior industry panel · 7 yrs industry experience",
      "research": "Reduced deployment time 70% via CI/CD redesign",
      "teachingRating": 4.7,
      "courseRating": 4.8,
      "students": "3,100+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Krishnan Iyer",
      "title": "Placement & Industry Liaison",
      "background": "Senior panel mentor · 8 yrs industry experience",
      "research": "Built internal Flutter design system",
      "teachingRating": 4.7,
      "courseRating": 4.7,
      "students": "2,900+",
      "exp": "8 yrs",
      "trial": true
    },
    {
      "name": "Sowmya Krishnan",
      "title": "Career Track Lead Mentor",
      "background": "Cross-functional panel · 6 yrs industry experience",
      "research": "Kaggle Expert, top 1% in 3 competitions",
      "teachingRating": 4.6,
      "courseRating": 4.8,
      "students": "4,800+",
      "exp": "6 yrs",
      "trial": true
    }
  ],
  "data-science-career-certificate-program": [
    {
      "name": "Tarun Menon",
      "title": "Capstone Project Mentor",
      "background": "Senior industry panel · 7 yrs industry experience",
      "research": "Coordinated 40+ student placements across partner companies",
      "teachingRating": 4.8,
      "courseRating": 4.6,
      "students": "2,100+",
      "exp": "7 yrs",
      "trial": true
    },
    {
      "name": "Rohit Selvam",
      "title": "Placement & Industry Liaison",
      "background": "Senior panel mentor · 6 yrs industry experience",
      "research": "OSCP certified, trained 1,000+ professionals",
      "teachingRating": 4.7,
      "courseRating": 4.9,
      "students": "4,800+",
      "exp": "6 yrs",
      "trial": true
    }
  ]
};

// ============================================
// COURSE DETAIL MODAL
// ============================================
function getCourseBySlug(slug) {
    return COURSE_DETAILS.find(c => c.slug === slug);
}

function ensureCourseModal() {
    let modal = document.getElementById('courseDetailModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'courseDetailModal';
    modal.className = 'course-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
        '<div class="course-modal-overlay" data-close-modal></div>' +
        '<div class="course-modal-panel" role="dialog" aria-modal="true">' +
            '<button class="course-modal-close" data-close-modal aria-label="Close">&times;</button>' +
            '<div class="course-modal-content" id="courseModalContent"></div>' +
        '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close-modal')) closeCourseModal();
        // "Book Free Trial" button inside modal body → open YouTube directly
        if (e.target.classList.contains('trial-btn')) {
            e.preventDefault();
            const slug = document.getElementById('facultySelectWrap') && document.getElementById('facultySelectWrap').getAttribute('data-slug');
            const videoId = getTrialVideoId(slug || '');
            window.open('https://www.youtube.com/watch?v=' + videoId, '_blank', 'noopener,noreferrer');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeCourseModal();
    });

    return modal;
}

function renderCourseModal(course) {
    const ribbonHtml = course.ribbon
        ? '<span class="course-modal-ribbon badge-' + (course.ribbon.toLowerCase().includes('best') ? 'bestseller' : course.ribbon.toLowerCase().includes('new') ? 'new' : course.ribbon.toLowerCase().includes('trend') ? 'trending' : 'nextgen') + '">' + course.ribbon + '</span>'
        : '';

    const curriculumDurations = ['14 min','22 min','35 min','28 min','40 min','31 min','25 min','38 min'];
    const curriculumHtml = course.curriculum.map((mod, i) =>
        '<li>' +
            '<span class="curriculum-step">' + (i + 1) + '</span>' +
            '<span style="flex:1">' + mod + '</span>' +
            '<span class="curriculum-duration">' + (curriculumDurations[i] || '30 min') + '</span>' +
        '</li>'
    ).join('');

    const skillTags = [
        'Problem Solving','Code Architecture','Debugging','Team Collaboration',
        'Version Control','Testing','Documentation','Performance'
    ].slice(0, 6);
    const skillsHtml = skillTags.map(t => '<span class="modal-skill-tag">' + t + '</span>').join('');

    // Determine category colour for kicker
    const catColours = {
        programming:'#1d4ed8', webdev:'#059669', mobile:'#0891b2',
        ai:'#7c3aed', data:'#d97706', security:'#dc2626',
        cloud:'#0284c7', design:'#db2777', business:'#4f46e5', certificate:'#b45309'
    };
    const catBg = {
        programming:'#eff6ff', webdev:'#f0fdf4', mobile:'#ecfeff',
        ai:'#f5f3ff', data:'#fffbeb', security:'#fef2f2',
        cloud:'#f0f9ff', design:'#fdf2f8', business:'#eef2ff', certificate:'#fffbeb'
    };
    const catKey = course.categoryKey || 'programming';
    const catStyle = 'color:' + (catColours[catKey]||'#1d4ed8') + ';background:' + (catBg[catKey]||'#eff6ff') + ';';

    return '' +
    // ── Banner
    '<div class="course-modal-banner">' +
        '<img src="' + course.img + '" alt="' + course.name + '" onerror="this.style.opacity=\'0\';">' +
        ribbonHtml +
        '<div class="modal-banner-overlay">' +
            '<span class="course-modal-level">' + course.level + '</span>' +
            '<span class="modal-banner-rating">⭐ ' + course.rating + ' · ' + course.ratingCount + '</span>' +
        '</div>' +
    '</div>' +

    // ── Body
    '<div class="course-modal-body">' +

        // Category kicker
        '<p class="course-modal-category" style="' + catStyle + '">' + course.icon + ' ' + course.category + '</p>' +
        '<h2>' + course.name + '</h2>' +
        '<p class="course-modal-desc">' + course.desc + '</p>' +

        // Stats strip
        '<div class="course-modal-stats">' +
            '<div><strong>⭐ ' + course.rating + '</strong><span>' + course.ratingCount + '</span></div>' +
            '<div><strong>👥 ' + course.enrolled + '</strong><span>Enrolled</span></div>' +
            '<div><strong>⏱ ' + course.duration + '</strong><span>Duration</span></div>' +
            '<div><strong>🎓 ' + course.cert + '</strong><span>Completion</span></div>' +
        '</div>' +

        // Price box
        '<div class="course-modal-price-box">' +
            '<div class="course-modal-price">' +
                '<span class="cmp-mrp">' + course.mrp + '</span>' +
                '<span class="cmp-price">' + course.price + '</span>' +
                '<span class="cmp-monthly">or ' + course.monthly + '</span>' +
            '</div>' +
            '<div class="course-modal-price-actions">' +
                '<button class="enroll-btn enroll-btn-modal">Enroll Now</button>' +
                '<button class="trial-btn">🎯 Book Free Trial</button>' +
            '</div>' +
        '</div>' +

        // Selected faculty note
        '<p class="selected-faculty-note" id="selectedFacultyNote">No instructor selected yet — choose one below to get started.</p>' +

        // Info grid
        '<div class="modal-section-title">Course Details</div>' +
        '<div class="course-modal-grid">' +
            '<div class="course-modal-grid-item"><h4>Mode</h4><p>' + course.mode + '</p></div>' +
            '<div class="course-modal-grid-item"><h4>Language</h4><p>' + course.language + '</p></div>' +
            '<div class="course-modal-grid-item"><h4>Next Batch</h4><p>' + course.batch + '</p></div>' +
            '<div class="course-modal-grid-item"><h4>Prerequisites</h4><p>' + course.prerequisites + '</p></div>' +
            '<div class="course-modal-grid-item" style="grid-column:1/-1"><h4>Certificate & Career Support</h4><p>' + course.placement + '</p></div>' +
        '</div>' +

        // Curriculum
        '<div class="course-modal-curriculum">' +
            '<div class="modal-section-title">Curriculum</div>' +
            '<ul>' + curriculumHtml + '</ul>' +
        '</div>' +

        // Skills
        '<div class="modal-section-title">Skills You\'ll Gain</div>' +
        '<div class="modal-skills-row">' + skillsHtml + '</div>' +

        // Faculty
        '<div class="course-modal-faculty" id="facultySelectWrap" data-slug="' + course.slug + '">' +
            '<div class="modal-section-title">Choose Your Instructor</div>' +
            '<p class="faculty-select-hint">Compare instructors by experience, expertise, teaching style, and student reviews — then lock in your choice or book a free trial session before committing.</p>' +
            '<div class="faculty-select-grid">' + renderFacultyOptions(course.slug, course.slug) + '</div>' +
        '</div>' +

    '</div>';
}

const FACULTY_SELECTIONS = {}; // courseSlug -> selected faculty index


// ============================================================
// FACULTY INTERACTIONS (select / unselect / trial)
// ============================================================
document.addEventListener('click', (e) => {
    const wrap = e.target.closest('#facultySelectWrap');
    if (!wrap) return;
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const slug = wrap.getAttribute('data-slug');
    const course = getCourseBySlug(slug);
    if (!course) return;
    const idx = parseInt(btn.getAttribute('data-idx'), 10);
    const faculty = (FACULTY_DATA[course.slug] || FACULTY_DATA['python-programming-masterclass'])[idx];
    const action = btn.getAttribute('data-action');

    if (action === 'select') {
        FACULTY_SELECTIONS[slug] = idx;
        wrap.querySelector('.faculty-select-grid').innerHTML = renderFacultyOptions(course.categoryKey, slug);
        const noteEl = document.getElementById('selectedFacultyNote');
        if (noteEl) {
            noteEl.textContent = '✓ Enrolling with ' + faculty.name + ' (' + faculty.title + ')';
            noteEl.classList.add('active');
        }
        showToast('✓ ' + faculty.name + ' selected as your instructor');

    } else if (action === 'unselect') {
        delete FACULTY_SELECTIONS[slug];
        wrap.querySelector('.faculty-select-grid').innerHTML = renderFacultyOptions(course.categoryKey, slug);
        const noteEl = document.getElementById('selectedFacultyNote');
        if (noteEl) {
            noteEl.textContent = 'Pick a faculty below — your selection will be carried into enrollment.';
            noteEl.classList.remove('active');
        }
        showToast('Faculty selection cleared');

    } else if (action === 'trial') {
        openTrialConfirm(faculty, course);
    }
});

// ── Faculty photos: real, professional studio-style headshots (no CORS issues)
// Each name maps to its own unique photo — no repeats across the whole faculty roster
// Faculty portraits — verified Unsplash adult professional headshots, one unique ID per person
const FACULTY_PORTRAITS = {
  // ── Male faculty — professional portraits
  'Mohan Krishnan':    '1519419691349-abdde72f12db',
  'Arjun Kapoor':      '1504257432389-52343af06ae3',
  'Ashok Patel':       '1560250097-0b93528c311a',
  'Yogesh Reddy':      '1507003211169-0a1dd7228f2d',
  'Rahul Gupta':       '1472099645785-5658abf4ff4e',
  'Sanjay Rajan':      '1500648767791-00dcc994a43e',
  'Rohit Anand':       '1556157382-97eda2d62296',
  'Pradeep Sharma':    '1539571696357-5a69c17a67c6',
  'Pradeep Nair':      '1521119989659-3e5e94b77a48',
  'Tarun Khanna':      '1549068106-b024bdef3dca',
  'Mahesh Balaji':     '1506794778202-cad84cf45f1d',
  'Harish Rajendran':  '1570295999919-56ceb5ecca61',
  'Naveen Kumar':      '1463453091185-61582044d556',
  'Nikhil Nair':       '1531427186611-141e5bb3b97c',
  'Siddharth Malhotra':'1537511446984-935f663eb1f4',
  'Kiran Joseph':      '1488161628813-04466f872be2',
  'Krishnan Iyer':     '1504593811423-6dd665756598',
  'Tarun Menon':       '1492562080023-ab3db95bfbce',
  'Rohit Selvam':      '1489980557514-251d17a1e3f1',
  'Arvind Saxena':     '1566492031773-4f4e44671857',
  'Balaji Narayanan':  '1568602471122-9b800e3e5b4d',
  'Rajesh Babu':       '1552058544-f2b08422138a',
  'Rohan Nair':        '1545167622-3a6ac756afa4',
  'Tarun Narayanan':   '1507591064-27082f09570c',
  'Ramesh Nair':       '1584999734482-0361aecad844',
  'Krishnan Chari':    '1600486913747-55e5470d7b40',
  'Shankar Pillai':    '1522556189639-9a13c5a81d10',
  'Nikhil Banerjee':   '1603415526960-f7e0328c63b1',
  'Sanjay Venkatesh':  '1565464027194-7bea32e33e4f',
  'Naveen Pillai':     '1513910367140-93af5ab3ce2a',
  'Rahul Chandra':     '1573496359142-b8d87734a5a2',

  // ── Female faculty — professional portraits
  'Ritu Sharma':       '1580489944761-15a19d654956',
  'Preethi Balaji':    '1573497019940-1c28c88b4f3e',
  'Anjali Singh':      '1531746020798-e6953c6e8e04',
  'Hema Iyer':         '1551836022-d5d88e9218df',
  'Nisha Verma':       '1508214751196-bcfd4ca60f91',
  'Shilpa Agarwal':    '1544005313-94ddf0286df2',
  'Lakshmi Narayanan': '1498551172505-8ee7ad69f235',
  'Meera Nambiar':     '1567532939604-b6b5b0db2604',
  'Roopa Sastry':      '1554151228-14d9def656e4',
  'Shreya Pandian':    '1546961342-ea5f73764162',
  'Pooja Bose':        '1587614313085-5f78e0169e69',
  'Sudha Mani':        '1509967419011-5773bab96ab2',
  'Meenakshi Joshi':   '1555212697-194d9d08ce3b',
  'Kavitha Rao':       '1529626455594-4ff0802cfb7e',
  'Indira Kannan':     '1598550874175-4d0ef436c909',
  'Indira Natarajan':  '1560365163-fa7d0b888395',
  'Priya Chatterjee':  '1590650153855-d9e808231d41',
  'Anita Desai':       '1601412436518-31bda6a855d5',
  'Pooja Subramaniam': '1614644147798-f8c0fc9da7f6',
  'Geeta Kapoor':      '1520813792240-56fc4a3765a7',
  'Sowmya Krishnan':   '1607746882042-944635dfe10e',
  'Deepa Mehta':       '1502685104226-ee32379fefbe',
  'Uma Jagan':         '1594744803329-e58b31de8bf5',
  'Bhavna Shetty':     '1582750433449-648ed127bb54',
  'Divya Babu':        '1589571894960-20bbe2828d0a',
  'Rupa Joshi':        '1583001931096-959e9a1a6223',
  'Sangeeta Mishra':   '1573496359142-b8d87734a5a2',
  'Geeta Kulkarni':    '1531123897727-240617094bc7',
  'Anita Khanna':      '1559918074-e5a6e7eaf4e7',
  'Laxmi Patil':       '1552053831-71594a27632d',
  'Meera Babu':        '1567532939604-b6b5b0db2604',
  'Priya Menon':       '1546961342-ea5f73764162',
};

function getFacultyPortrait(name) {
    const id = FACULTY_PORTRAITS[name];
    if (!id) return null;
    return 'https://images.unsplash.com/photo-' + id
        + '?w=200&h=200&fit=crop&crop=face,top&auto=format&q=90&fm=jpg';
}

// ---- Faculty option renderer — with SVG portraits ----
function renderFacultyOptions(categoryKey, courseSlug) {
    const list = FACULTY_DATA[courseSlug] || FACULTY_DATA[categoryKey] || FACULTY_DATA['python-programming-masterclass'];
    const selectedIdx = FACULTY_SELECTIONS[courseSlug];

    // Rich bio by seniority
    const FACULTY_BIOS = {
        default:    'An experienced industry professional with a strong track record of mentoring students into job-ready engineers. Blends real-project exposure with structured theory to make complex topics genuinely click.',
        senior:     'Brings deep industry experience from leading product teams at scale and shipping production-grade software. Known for making tough concepts approachable through live debugging, code reviews, and real-world case studies.',
        researcher: 'Published researcher turned educator — bridges academic rigour with hands-on application. Students consistently leave with stronger mental models, better debugging habits, and portfolio projects they are proud of.'
    };

    // Teaching styles per index
    const TEACHING_STYLES = [
        ['Project-First', 'Live Coding', 'Code Review'],
        ['Concept-Led', 'Case Studies', 'Pair Programming'],
        ['Research-Based', 'Deep Dives', 'Peer Discussion']
    ];

    // Expertise tags per index (fallback)
    const EXPERTISE_SETS = [
        ['System Design', 'Backend Dev', 'APIs', 'DevOps'],
        ['Frontend Arch', 'Performance', 'Testing', 'CI/CD'],
        ['ML/AI', 'Data Structures', 'Algorithms', 'Research']
    ];

    // Achievements per index
    const ACHIEVEMENTS = [
        [
            { icon: '🏆', text: 'Best Instructor Award — LearnCraft Hub 2024' },
            { icon: '🎓', text: '3,400+ students mentored across 12 cohorts' },
            { icon: '📦', text: 'Led engineering at two Series-B startups' }
        ],
        [
            { icon: '⭐', text: 'Rated #1 Instructor in cohort satisfaction surveys' },
            { icon: '📝', text: 'Authored 3 industry-adopted open-source libraries' },
            { icon: '🧑‍🏫', text: '8 years of full-time teaching & curriculum design' }
        ],
        [
            { icon: '🔬', text: 'Published 4 peer-reviewed papers in applied ML' },
            { icon: '🚀', text: 'Ex-researcher at a FAANG AI lab' },
            { icon: '🤝', text: 'Active mentor at national coding bootcamps' }
        ]
    ];

    return list.map((f, i) => {
        const isSelected = selectedIdx === i;
        const bioKey = f.research && f.research.toLowerCase().includes('publish') ? 'researcher' :
                       f.exp && parseInt(f.exp) >= 8 ? 'senior' : 'default';
        const bio        = FACULTY_BIOS[bioKey];
        const styles     = TEACHING_STYLES[i % 3];
        const expertise  = EXPERTISE_SETS[i % 3];
        const achievs    = ACHIEVEMENTS[i % 3];

        return (
        '<div class="faculty-option-card' + (isSelected ? ' selected' : '') + '" data-faculty-idx="' + i + '">' +

            // ── Header band
            '<div class="faculty-card-header">' +
                '<div class="faculty-photo-wrap" style="width:80px;height:80px;aspect-ratio:unset;background:transparent;overflow:hidden;flex-shrink:0;border-radius:50%;border:3px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,0.12);">' +
                '<img class="faculty-photo" src="' + getFacultyPortrait(f.name) + '" alt="Photo of ' + f.name + '" ' +
                    'style="display:block;width:80px;height:80px;border-radius:50%;object-fit:cover;object-position:center top;background:#dbeafe;" ' +
                    'loading="eager" ' +
                    'onerror="this.onerror=null;this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<div class="faculty-avatar-fallback" style="display:none;width:80px;height:80px;border-radius:50%;' +
                    'background:linear-gradient(135deg,#3b82f6,#1e3a8a);color:#fff;font-weight:800;font-size:1.5rem;letter-spacing:1px;' +
                    'align-items:center;justify-content:center;flex-shrink:0;">' +
                    f.name.charAt(0) + f.name.split(' ').slice(-1)[0].charAt(0) +
                '</div>' +
            '</div>' +
                '<div class="faculty-header-info">' +
                    '<h4>' + f.name + '</h4>' +
                    '<p class="faculty-title">' + f.title + '</p>' +
                    '<span class="faculty-exp-tag">📅 ' + (f.exp ? f.exp.replace(/\s*yrs?\.?/i,'').trim() : '6+') + ' yrs experience</span>' +
                '</div>' +
                (isSelected ? '<span class="faculty-selected-badge">✓ Selected</span>' : '') +
            '</div>' +

            // ── Body
            '<div class="faculty-card-body">' +

                // Background headline
                '<p class="faculty-option-background">' + f.background + '</p>' +

                // Bio
                '<p class="faculty-bio-text">' + bio + '</p>' +

                // Expertise tags
                '<div class="faculty-expertise-row">' +
                    expertise.map(function(tag) {
                        return '<span class="faculty-expertise-tag">' + tag + '</span>';
                    }).join('') +
                '</div>' +

                // Research note
                '<p class="faculty-option-research">🔬 ' + f.research + '</p>' +

                // Teaching style
                '<div class="faculty-teaching-row">' +
                    '<span class="faculty-teaching-label">Teaching style</span>' +
                    styles.map(function(s) {
                        return '<span class="faculty-teaching-pill">' + s + '</span>';
                    }).join('') +
                '</div>' +

                // Achievements
                '<div class="faculty-achievements">' +
                    achievs.map(function(a) {
                        return '<div class="faculty-achievement-item"><span class="ach-icon">' + a.icon + '</span>' + a.text + '</div>';
                    }).join('') +
                '</div>' +

                // Stats strip
                '<div class="faculty-option-stats">' +
                    '<div><strong>⭐ ' + f.courseRating + '</strong><span>Course Rating</span></div>' +
                    '<div><strong>' + f.teachingRating + '</strong><span>Teaching Score</span></div>' +
                    '<div><strong>' + f.students + '</strong><span>Students Taught</span></div>' +
                '</div>' +

                // Action buttons
                '<div class="faculty-option-actions">' +
                    (isSelected
                        ? '<button type="button" class="faculty-select-btn" data-action="unselect" data-idx="' + i + '">✓ Selected — Click to Unselect</button>'
                        : '<button type="button" class="faculty-select-btn" data-action="select"   data-idx="' + i + '">Choose This Instructor</button>'
                    ) +
                    '<button type="button" class="faculty-trial-btn" data-action="trial" data-idx="' + i + '">🎯 Book Free Trial</button>' +
                '</div>' +

            '</div>' + // end body
        '</div>'
        );
    }).join('');
}

// ============================================================
// TOAST UTILITY
// ============================================================
function showToast(msg, duration) {
    duration = duration || 3000;
    let toast = document.getElementById('enrollToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'enrollToast';
        toast.className = 'enroll-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================================
// TRIAL CONFIRM POPUP
// ============================================================
function openTrialConfirm(faculty, course) {
    const el = document.createElement('div');
    el.className = 'unenroll-confirm-overlay trial-confirm-overlay';
    el.innerHTML = '' +
        '<div class="unenroll-confirm-card trial-confirm-card">' +
            '<div style="font-size:2rem;margin-bottom:12px;">🎯</div>' +
            '<h3>Book a Free Trial Session</h3>' +
            '<p>You\'re requesting a free 30-minute trial class with <strong>' + faculty.name + '</strong> (' + faculty.title + ') for <strong>' + course.name + '</strong>.</p>' +
            '<p style="margin-top:-10px;">Our admissions team will reach out within 24 hours to schedule your session.</p>' +
            '<div class="unenroll-confirm-actions">' +
                '<button class="btn-confirm-unenroll" style="background:#2563eb;" id="trialConfirmBtn">Confirm Request</button>' +
                '<button class="btn-cancel-unenroll" id="trialCancelBtn">Cancel</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(el);
    el.querySelector('#trialConfirmBtn').addEventListener('click', () => {
        el.remove();
        showToast('🎯 Trial session requested! We\'ll reach out within 24 hours.', 4000);
    });
    el.querySelector('#trialCancelBtn').addEventListener('click', () => el.remove());
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}

// ============================================================
// ENROLLMENT PERSISTENCE (browser localStorage)
// ------------------------------------------------------------
// Simple, no-setup persistence: enrollment state is saved in the
// student's browser via localStorage, so it survives page refreshes
// and repeat visits on the same browser/device (until cleared or
// unenrolled). No server, no install steps — just open the HTML file.
// ============================================================
const ENROLLMENT_STORAGE_KEY = 'lch_enrollments';

function loadEnrollments() {
    try {
        return JSON.parse(localStorage.getItem(ENROLLMENT_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function saveEnrollments(data) {
    try {
        localStorage.setItem(ENROLLMENT_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        // localStorage unavailable (private browsing, storage full, etc.) — fail silently
    }
}

function isEnrolled(slug) {
    return !!loadEnrollments()[slug];
}

function getEnrollment(slug) {
    return loadEnrollments()[slug] || null;
}

function addEnrollment(slug, info) {
    const data = loadEnrollments();
    data[slug] = Object.assign(
        { plan: 'free', enrolledAt: new Date().toISOString() },
        data[slug],
        info
    );
    saveEnrollments(data);
    return data[slug];
}

function removeEnrollment(slug) {
    const data = loadEnrollments();
    delete data[slug];
    saveEnrollments(data);
}

// Reflect saved enrollment state onto every "Enroll Now" button on the page
function refreshEnrollButtonStates() {
    document.querySelectorAll('.full-course-card').forEach(card => {
        const h3 = card.querySelector('h3');
        const btn = card.querySelector('.enroll-btn');
        if (!h3 || !btn) return;
        const slug = slugForCourse(h3.textContent.trim());
        if (isEnrolled(slug)) {
            btn.textContent = '✓ Enrolled';
            btn.classList.add('is-enrolled');
        } else {
            btn.textContent = 'Enroll Now';
            btn.classList.remove('is-enrolled');
        }
    });
}

// Run on initial load (covers both "script still parsing" and "already loaded" cases)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    refreshEnrollButtonStates();
} else {
    document.addEventListener('DOMContentLoaded', refreshEnrollButtonStates);
}

// ============================================================
// "MY COURSES" BANNER (below the hero) — shows/hides based on
// whether the learner has any active enrollments in localStorage.
// ============================================================
function updateMyCoursesBanner() {
    const banner = document.getElementById('myCoursesBanner');
    if (!banner) return;
    const count = Object.keys(loadEnrollments()).length;
    if (count > 0) {
        banner.hidden = false;
        const countEl = document.getElementById('mcbCount');
        if (countEl) countEl.textContent = count;
        const heading = document.getElementById('mcbHeading');
        if (heading && heading.lastChild) {
            heading.lastChild.textContent = count === 1 ? ' course' : ' courses';
        }
    } else {
        banner.hidden = true;
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    updateMyCoursesBanner();
} else {
    document.addEventListener('DOMContentLoaded', updateMyCoursesBanner);
}

document.getElementById('myCoursesBannerBtn') && document.getElementById('myCoursesBannerBtn').addEventListener('click', () => {
    openMyCoursesDashboard('enrolled');
});

// ============================================================
// WISHLIST (Save for Later) — localStorage, same pattern as enrollments
// ============================================================
const WISHLIST_STORAGE_KEY = 'lch_wishlist';

function loadWishlist() {
    try {
        return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveWishlist(arr) {
    try {
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(arr));
    } catch (e) { /* private mode, storage full, etc. */ }
}

function isWishlisted(slug) {
    return loadWishlist().includes(slug);
}

function toggleWishlist(slug) {
    const list = loadWishlist();
    const idx = list.indexOf(slug);
    if (idx === -1) {
        list.push(slug);
        saveWishlist(list);
        return true; // now wishlisted
    } else {
        list.splice(idx, 1);
        saveWishlist(list);
        return false; // now removed
    }
}

// Inject a heart/save button onto every course card's image area (once)
function injectWishlistButtons() {
    document.querySelectorAll('.full-course-card').forEach(card => {
        if (card.querySelector('.wishlist-heart-btn')) return; // already injected
        const imgWrap = card.querySelector('.course-card-img');
        const h3 = card.querySelector('h3');
        if (!h3 || !imgWrap) return;
        const slug = slugForCourse(h3.textContent.trim());

        const heart = document.createElement('button');
        heart.className = 'wishlist-heart-btn';
        heart.type = 'button';
        heart.setAttribute('aria-label', 'Save to wishlist');
        heart.dataset.slug = slug;
        heart.innerHTML = '♥';
        heart.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nowSaved = toggleWishlist(slug);
            heart.classList.toggle('is-saved', nowSaved);
            showToast(nowSaved ? '❤️ Saved to your wishlist' : 'Removed from wishlist', 2200);
        });
        if (isWishlisted(slug)) heart.classList.add('is-saved');

        imgWrap.appendChild(heart);
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectWishlistButtons();
} else {
    document.addEventListener('DOMContentLoaded', injectWishlistButtons);
}

// ============================================================
// "MY COURSES" DASHBOARD — Enrolled + Wishlist, all in one place
// ============================================================
function openMyCoursesDashboard(initialTab) {
    const existing = document.getElementById('myCoursesOverlay');
    if (existing) existing.remove();

    const enrollments = loadEnrollments();
    const enrolledSlugs = Object.keys(enrollments);
    const wishlistSlugs = loadWishlist();

    const overlay = document.createElement('div');
    overlay.className = 'my-courses-overlay';
    overlay.id = 'myCoursesOverlay';

    overlay.innerHTML = '' +
    '<div class="wn-header">' +
        '<div class="wn-header-brand">LearnCraft<span>Hub</span></div>' +
        '<div class="wn-header-nav">' +
            '<button class="wn-back-btn" id="myCoursesBackBtn">← Back to Courses</button>' +
        '</div>' +
    '</div>' +
    '<div class="mc-body">' +
        '<h2 class="mc-title">My Learning</h2>' +
        '<div class="mc-tabs">' +
            '<button class="mc-tab-btn active" id="mcTabEnrolled" data-tab="enrolled">Enrolled (' + enrolledSlugs.length + ')</button>' +
            '<button class="mc-tab-btn" id="mcTabWishlist" data-tab="wishlist">Wishlist (' + wishlistSlugs.length + ')</button>' +
        '</div>' +
        '<div class="mc-panel" id="mcPanelEnrolled">' + renderEnrolledPanel(enrolledSlugs) + '</div>' +
        '<div class="mc-panel" id="mcPanelWishlist" style="display:none;">' + renderWishlistPanel(wishlistSlugs) + '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#myCoursesBackBtn').addEventListener('click', () => overlay.remove());

    overlay.querySelectorAll('.mc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.mc-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const showEnrolled = btn.dataset.tab === 'enrolled';
            overlay.querySelector('#mcPanelEnrolled').style.display = showEnrolled ? 'block' : 'none';
            overlay.querySelector('#mcPanelWishlist').style.display = showEnrolled ? 'none' : 'block';
        });
    });

    wireMyCoursesActions(overlay);

    if (initialTab === 'wishlist') {
        overlay.querySelector('#mcTabWishlist').click();
    }
}

function renderEnrolledPanel(slugs) {
    if (!slugs.length) {
        return '' +
            '<div class="mc-empty-state">' +
                '<div class="mc-empty-icon">🎓</div>' +
                '<h3>No courses yet</h3>' +
                '<p>Once you enroll in a course, it\'ll show up here with quick access to continue learning.</p>' +
                '<button class="mc-browse-btn" onclick="document.getElementById(\'myCoursesOverlay\').remove()">Browse Courses</button>' +
            '</div>';
    }
    const enrollments = loadEnrollments();
    return '<div class="mc-grid">' + slugs.map(slug => {
        const course = getCourseBySlug(slug);
        if (!course) return '';
        const rec = enrollments[slug];
        const facultyList = FACULTY_DATA[slug] || FACULTY_DATA['python-programming-masterclass'];
        const faculty = facultyList[rec.facultyIdx !== undefined ? rec.facultyIdx : 0];
        const planLabel = rec.plan === 'full' ? 'Full Course' : rec.plan === 'monthly' ? 'Monthly Plan' : 'Free Access';
        const enrolledDate = rec.enrolledAt ? new Date(rec.enrolledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '' +
        '<div class="mc-card" data-slug="' + slug + '">' +
            '<img class="mc-card-img" src="' + course.img + '" alt="' + course.name + '" onerror="this.style.background=\'#1e3a8a\'">' +
            '<div class="mc-card-body">' +
                '<span class="mc-plan-badge mc-plan-' + (rec.plan || 'free') + '">' + planLabel + '</span>' +
                '<h4>' + course.name + '</h4>' +
                '<div class="mc-card-faculty">👤 ' + (faculty ? faculty.name : 'Instructor') + '</div>' +
                (enrolledDate ? '<div class="mc-card-date">Enrolled ' + enrolledDate + '</div>' : '') +
                '<div class="mc-card-actions">' +
                    '<button class="mc-continue-btn" data-slug="' + slug + '">▶ Continue Learning</button>' +
                    '<button class="mc-unenroll-btn" data-slug="' + slug + '" title="Unenroll">✕</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('') + '</div>';
}

function renderWishlistPanel(slugs) {
    if (!slugs.length) {
        return '' +
            '<div class="mc-empty-state">' +
                '<div class="mc-empty-icon">🤍</div>' +
                '<h3>Your wishlist is empty</h3>' +
                '<p>Tap the heart icon on any course card to save it here for later.</p>' +
                '<button class="mc-browse-btn" onclick="document.getElementById(\'myCoursesOverlay\').remove()">Browse Courses</button>' +
            '</div>';
    }
    return '<div class="mc-grid">' + slugs.map(slug => {
        const course = getCourseBySlug(slug);
        if (!course) return '';
        return '' +
        '<div class="mc-card" data-slug="' + slug + '">' +
            '<img class="mc-card-img" src="' + course.img + '" alt="' + course.name + '" onerror="this.style.background=\'#1e3a8a\'">' +
            '<div class="mc-card-body">' +
                '<div class="mc-card-rating">⭐ ' + course.rating + ' · ' + course.ratingCount + '</div>' +
                '<h4>' + course.name + '</h4>' +
                '<div class="mc-card-price">' + course.price + ' <s>' + course.mrp + '</s></div>' +
                '<div class="mc-card-actions">' +
                    '<button class="mc-continue-btn" data-slug="' + slug + '" data-action="view">View Course</button>' +
                    '<button class="mc-unenroll-btn" data-slug="' + slug + '" data-action="unwish" title="Remove from wishlist">✕</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('') + '</div>';
}

function wireMyCoursesActions(overlay) {
    overlay.querySelectorAll('.mc-continue-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const slug = btn.dataset.slug;
            const course = getCourseBySlug(slug);
            if (!course) return;
            if (btn.dataset.action === 'view') {
                overlay.remove();
                openCourseModal(slug);
                return;
            }
            const rec = getEnrollment(slug);
            const facultyList = FACULTY_DATA[slug] || FACULTY_DATA['python-programming-masterclass'];
            const faculty = facultyList[rec && rec.facultyIdx !== undefined ? rec.facultyIdx : 0];
            overlay.remove();
            openWhatsNext(course, faculty);
        });
    });

    overlay.querySelectorAll('.mc-unenroll-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const slug = btn.dataset.slug;
            if (btn.dataset.action === 'unwish') {
                toggleWishlist(slug);
                document.querySelectorAll('.wishlist-heart-btn[data-slug="' + slug + '"]').forEach(h => h.classList.remove('is-saved'));
                openMyCoursesDashboard('wishlist');
                return;
            }
            const course = getCourseBySlug(slug);
            if (!confirm('Unenroll from "' + (course ? course.name : 'this course') + '"? This cannot be undone.')) return;
            removeEnrollment(slug);
            delete FACULTY_SELECTIONS[slug];
            refreshEnrollButtonStates();
            updateMyCoursesBanner();
            showToast('You have been unenrolled.', 3000);
            openMyCoursesDashboard('enrolled');
        });
    });
}

document.getElementById('myCoursesNavLink') && document.getElementById('myCoursesNavLink').addEventListener('click', (e) => {
    e.preventDefault();
    openMyCoursesDashboard('enrolled');
});

// ============================================================
// ENROLL BUTTON → SUCCESS CARD → WHAT'S NEXT
// ============================================================
// Intercept all "Enroll Now" clicks (both card and modal)
document.addEventListener('click', (e) => {
    const enrollBtn = e.target.closest('.enroll-btn');
    if (!enrollBtn) return;
    e.preventDefault();
    e.stopPropagation();

    // Find course from modal if open, else from card
    let slug = null;
    const modalContent = document.getElementById('courseModalContent');
    if (modalContent) {
        const facultyWrap = modalContent.querySelector('#facultySelectWrap');
        if (facultyWrap) slug = facultyWrap.getAttribute('data-slug');
    }
    if (!slug) {
        const card = enrollBtn.closest('.full-course-card');
        if (card) {
            const h3 = card.querySelector('h3');
            if (h3) slug = slugForCourse(h3.textContent.trim());
        }
    }

    const course = slug ? getCourseBySlug(slug) : null;
    if (!course) return;

    closeCourseModal();

    // Already enrolled on this browser? Skip the success popup and go straight to the dashboard.
    if (isEnrolled(course.slug)) {
        const saved = getEnrollment(course.slug);
        const facultyIdx = saved && saved.facultyIdx !== undefined ? saved.facultyIdx : 0;
        const facultyList = FACULTY_DATA[course.slug] || FACULTY_DATA['python-programming-masterclass'];
        openWhatsNext(course, facultyList[facultyIdx]);
        return;
    }

    // Brand-new enrollment — persist it, refresh button states, then show the success card
    const chosenFacultyIdx = FACULTY_SELECTIONS[course.slug] !== undefined ? FACULTY_SELECTIONS[course.slug] : 0;
    addEnrollment(course.slug, { facultyIdx: chosenFacultyIdx });
    refreshEnrollButtonStates();
    updateMyCoursesBanner();
    showEnrollSuccess(course);
});

function showEnrollSuccess(course) {
    const facultyIdx = FACULTY_SELECTIONS[course.slug];
    const facultyList = FACULTY_DATA[course.slug] || FACULTY_DATA['python-programming-masterclass'];
    const faculty = facultyList[facultyIdx !== undefined ? facultyIdx : 0];

    const overlay = document.createElement('div');
    overlay.className = 'enroll-success-overlay';
    overlay.innerHTML = '' +
        '<div class="enroll-success-card">' +
            '<div class="enroll-success-header">' +
                '<div class="enroll-success-checkmark">✓</div>' +
                '<h2>You\'re In! 🎉</h2>' +
                '<p>You\'ve successfully enrolled in <strong>' + course.name + '</strong>.<br>Your learning journey starts now.</p>' +
            '</div>' +
            '<div class="enroll-success-body">' +
                '<div class="enroll-success-course-row">' +
                    '<img class="enroll-success-course-img" src="' + course.img + '" alt="' + course.name + '" onerror="this.style.background=\'#1e3a8a\'">' +
                    '<div class="enroll-success-course-info">' +
                        '<h4>' + course.name + '</h4>' +
                        '<p>Instructor: ' + faculty.name + ' · ' + faculty.title + '</p>' +
                        '<p style="margin-top:2px;color:#10b981;font-weight:700;font-size:0.75rem;">⭐ ' + faculty.courseRating + ' · ' + faculty.students + ' students taught</p>' +
                    '</div>' +
                '</div>' +
                '<div class="enroll-success-meta">' +
                    '<div class="enroll-success-meta-item"><span class="esm-icon">🗓️</span><span class="esm-label">' + course.duration + '</span></div>' +
                    '<div class="enroll-success-meta-item"><span class="esm-icon">🎓</span><span class="esm-label">Certificate</span></div>' +
                    '<div class="enroll-success-meta-item"><span class="esm-icon">📱</span><span class="esm-label">Free Access</span></div>' +
                '</div>' +
                '<div class="enroll-success-actions">' +
                    '<button class="btn-whats-next" id="goToWhatsNext">▶ Go to What\'s Next →</button>' +
                    '<button class="btn-close-success" id="closeSuccessOverlay">Stay on courses page</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#goToWhatsNext').addEventListener('click', () => {
        overlay.remove();
        openWhatsNext(course, faculty);
    });
    overlay.querySelector('#closeSuccessOverlay').addEventListener('click', () => {
        overlay.remove();
        showToast('Enrolled in ' + course.name + '! Check your email for details.');
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ============================================================
// WHAT'S NEXT PAGE
// ============================================================
const COURSE_REVIEWS = [
    { name: 'Priya S.', avatar: '#10b981', stars: 5, date: '2 weeks ago', text: 'Honestly one of the best structured courses I\'ve taken. The real-project approach makes the difference — I shipped something to production by week 4. The mentor feedback was thoughtful and pushed me to write better code.', helpful: 14 },
    { name: 'Arun K.', avatar: '#2563eb', stars: 5, date: '1 month ago', text: 'The curriculum is dense but well-paced. I came in with zero background and left with a portfolio piece I\'m genuinely proud of. The faculty Q&A sessions were incredibly useful for debugging my mental model.', helpful: 9 },
    { name: 'Sneha R.', avatar: '#8b5cf6', stars: 4, date: '3 weeks ago', text: 'Very practical and industry-relevant. Appreciated how the instructor explained the "why" behind every concept, not just the how. The only thing I\'d want more of is advanced topics in the later modules.', helpful: 6 },
    { name: 'Vikram M.', avatar: '#f59e0b', stars: 5, date: '5 days ago', text: 'Switched careers after this course. Got hired within 2 months of completing the certificate. The mock interviews and resume review sessions were game-changers for me.', helpful: 22 }
];

const RELATED_COURSES_FOR_NEXT = [
    { name: 'Full Stack Web Development', rating: '4.9', mrp: '₹16,999', price: '₹12,594', img: 'https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=400&q=70', slug: 'full-stack-web-development' },
    { name: 'AI & Machine Learning', rating: '4.8', mrp: '₹14,999', price: '₹10,495', img: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=400&q=70', slug: 'ai-machine-learning' },
    { name: 'Data Analytics', rating: '4.7', mrp: '₹8,999', price: '₹6,147', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=70', slug: 'data-analytics' },
    { name: 'UI/UX & Product Design', rating: '4.7', mrp: '₹11,999', price: '₹7,596', img: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=400&q=70', slug: 'ui-ux-product-design' }
];

function openWhatsNext(course, faculty) {
    const panel = document.createElement('div');
    panel.className = 'whats-next-overlay';
    panel.id = 'whatsNextPanel';

    const ratingBars = [
        { label: '5★', pct: 72, color: '#10b981' },
        { label: '4★', pct: 18, color: '#84cc16' },
        { label: '3★', pct: 6,  color: '#fbbf24' },
        { label: '2★', pct: 3,  color: '#f97316' },
        { label: '1★', pct: 1,  color: '#ef4444' }
    ];

    const lessonList = [
        { num: '▶', title: 'Introduction & Course Roadmap', meta: '12 min', free: true },
        { num: '2', title: 'Setting Up Your Environment', meta: '18 min', free: true },
        { num: '3', title: 'Core Concepts Deep-Dive', meta: '34 min', free: false },
        { num: '4', title: 'Hands-On Project Part 1', meta: '45 min', free: false },
        { num: '5', title: 'Hands-On Project Part 2', meta: '41 min', free: false },
        { num: '6', title: 'Code Review & Best Practices', meta: '28 min', free: false }
    ];

    panel.innerHTML = '' +
    '<div class="wn-header">' +
        '<div class="wn-header-brand">LearnCraft<span>Hub</span></div>' +
        '<div class="wn-header-nav">' +
            '<button class="wn-back-btn" id="wnBackBtn">← Back to Courses</button>' +
        '</div>' +
    '</div>' +
    '<div class="wn-progress-bar"><div class="wn-progress-fill" id="wnProgressFill"></div></div>' +

    '<div class="wn-body">' +

        // Course banner
        '<div class="wn-course-banner">' +
            '<div class="wn-course-banner-img" style="width:260px;flex-shrink:0;">' +
                '<img src="' + course.img + '" alt="' + course.name + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.background=\'#1e3a8a\'">' +
            '</div>' +
            '<div class="wn-course-banner-info">' +
                '<span class="wn-enrolled-badge">✓ Enrolled</span>' +
                '<h2>' + course.name + '</h2>' +
                '<p>' + course.desc + '</p>' +
                '<div class="wn-faculty-row">' +
                    '<div class="wn-faculty-avatar">' + faculty.name.charAt(0) + '</div>' +
                    '<div class="wn-faculty-info">' +
                        '<strong>' + faculty.name + '</strong>' +
                        faculty.title + ' · ⭐ ' + faculty.courseRating + ' · ' + faculty.students + ' students' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // Free Trial Video
        '<div class="wn-section">' +
            '<div class="wn-section-title">Free Trial Lesson — Watch Now</div>' +
            '<div class="wn-video-player" id="wnVideoPlayer" data-slug="' + course.slug + '">' +
                '<img src="https://img.youtube.com/vi/' + getTrialVideoId(course.slug) + '/hqdefault.jpg" alt="' + course.name + '" onerror="this.src=\'' + course.img + '\'">' +
                '<span class="wn-video-tag">▶ Free Preview</span>' +
                '<span class="wn-video-duration">YouTube</span>' +
                '<div class="wn-video-play-btn">' +
                    '<div class="wn-play-circle" style="background:#FF0000;">▶</div>' +
                    '<div class="wn-video-label">Play: Introduction & Course Overview</div>' +
                '</div>' +
            '</div>' +
            '<div class="wn-lessons-list">' +
                lessonList.map((l) => '' +
                    '<div class="wn-lesson-row' + (l.free ? ' free-preview' : ' locked') + '">' +
                        '<div class="wn-lesson-num">' + l.num + '</div>' +
                        '<span class="wn-lesson-title">' + l.title + '</span>' +
                        '<span class="wn-lesson-meta">' + l.meta + '</span>' +
                        (l.free ? '<span class="wn-lesson-play">▶</span>' : '<span class="wn-lesson-lock">🔒</span>') +
                    '</div>'
                ).join('') +
            '</div>' +
        '</div>' +

        // Payment
        '<div class="wn-section">' +
            '<div class="wn-section-title">Unlock Full Access — Choose Your Plan</div>' +
            '<div class="wn-payment-grid">' +
                // Monthly
                '<div class="wn-plan-card">' +
                    '<div class="wn-plan-name">Monthly</div>' +
                    '<div class="wn-plan-price">' + course.monthly.replace('/mo','') + '<sub>/mo</sub></div>' +
                    '<div class="wn-plan-mrp">Billed monthly</div>' +
                    '<div class="wn-plan-save">Cancel anytime</div>' +
                    '<ul class="wn-plan-features">' +
                        '<li>Full course access</li>' +
                        '<li>Live mentor sessions</li>' +
                        '<li>Community forum</li>' +
                    '</ul>' +
                    '<button class="wn-plan-btn" onclick="handlePayment(\'monthly\')">Get Monthly</button>' +
                '</div>' +
                // Full course (recommended)
                '<div class="wn-plan-card recommended">' +
                    '<div class="wn-plan-badge">Most Popular</div>' +
                    '<div class="wn-plan-name">Full Course</div>' +
                    '<div class="wn-plan-price">' + course.price + '</div>' +
                    '<div class="wn-plan-mrp">Was ' + course.mrp + '</div>' +
                    '<div class="wn-plan-save">Save ' + calcSaving(course.mrp, course.price) + ' · One-time payment</div>' +
                    '<ul class="wn-plan-features">' +
                        '<li>Full course access</li>' +
                        '<li>Live mentor sessions</li>' +
                        '<li>Certificate on completion</li>' +
                        '<li>Lifetime access + updates</li>' +
                        '<li>Career guidance access</li>' +
                    '</ul>' +
                    '<button class="wn-plan-btn" onclick="handlePayment(\'full\')">Enroll at ' + course.price + '</button>' +
                '</div>' +
                // Certificate
                '<div class="wn-plan-card">' +
                    '<div class="wn-plan-name">Job-Ready Bundle</div>' +
                    '<div class="wn-plan-price">Custom</div>' +
                    '<div class="wn-plan-mrp">Talk to counsellor</div>' +
                    '<div class="wn-plan-save">EMI options available</div>' +
                    '<ul class="wn-plan-features">' +
                        '<li>This course + 2 electives</li>' +
                        '<li>1:1 career coaching</li>' +
                        '<li>Interview prep</li>' +
                        '<li>Placement assistance</li>' +
                    '</ul>' +
                    '<button class="wn-plan-btn" onclick="handlePayment(\'bundle\')">Talk to Counsellor</button>' +
                '</div>' +
            '</div>' +
            '<div class="wn-payment-note">🔒 Secure payment · <a href="#">Refund policy</a> · 7-day money-back guarantee</div>' +
            '<div class="wn-payment-logos">' +
                '<span>UPI</span><span>Credit Card</span><span>Debit Card</span><span>Net Banking</span><span>EMI</span>' +
            '</div>' +
            '<div class="wn-payment-disclaimer">Demo checkout — this page simulates the payment flow only. No real charge is made and no live payment gateway is connected.</div>' +
        '</div>' +

        // Reviews
        '<div class="wn-section">' +
            '<div class="wn-section-title">What Students Say</div>' +
            '<div class="wn-reviews-summary">' +
                '<div class="wn-rating-big">' +
                    '<div class="wn-num">' + course.rating + '</div>' +
                    '<div class="wn-stars-big">★★★★★</div>' +
                    '<div class="wn-count">' + course.ratingCount + '</div>' +
                '</div>' +
                '<div class="wn-rating-bars">' +
                    ratingBars.map((b) => '' +
                        '<div class="wn-bar-row">' +
                            '<span class="wn-bar-label">' + b.label + '</span>' +
                            '<div class="wn-bar-track"><div class="wn-bar-fill" style="width:' + b.pct + '%;background:' + b.color + ';"></div></div>' +
                            '<span class="wn-bar-pct">' + b.pct + '%</span>' +
                        '</div>'
                    ).join('') +
                '</div>' +
            '</div>' +
            '<div class="wn-review-cards">' +
                COURSE_REVIEWS.map((r) => '' +
                    '<div class="wn-review-card">' +
                        '<div class="wn-review-top">' +
                            '<div class="wn-reviewer-avatar" style="background:' + r.avatar + ';">' + r.name.charAt(0) + '</div>' +
                            '<div class="wn-reviewer-info"><strong>' + r.name + '</strong><span>' + r.date + '</span></div>' +
                            '<div class="wn-review-stars">' + '★'.repeat(r.stars) + '</div>' +
                        '</div>' +
                        '<p class="wn-review-text">' + r.text + '</p>' +
                        '<div class="wn-review-helpful">Helpful? <button onclick="markHelpful(this,' + r.helpful + ')">👍 ' + r.helpful + '</button></div>' +
                    '</div>'
                ).join('') +
            '</div>' +
        '</div>' +

        // Write Review
        '<div class="wn-section">' +
            '<div class="wn-section-title">Share Your Experience</div>' +
            '<div class="wn-write-review">' +
                '<h4>Rate this course</h4>' +
                '<p>Your review helps other students make better decisions.</p>' +
                '<div class="wn-star-picker" id="wnStarPicker">' +
                    '<span data-v="1">★</span><span data-v="2">★</span><span data-v="3">★</span><span data-v="4">★</span><span data-v="5">★</span>' +
                '</div>' +
                '<textarea class="wn-review-textarea" id="wnReviewText" placeholder="What did you enjoy most? What could be improved? Be specific — other students will thank you."></textarea>' +
                '<button class="wn-review-submit" onclick="submitReview()">Submit Review</button>' +
            '</div>' +
        '</div>' +

        // Manage Enrollment
        '<div class="wn-section">' +
            '<div class="wn-section-title">Manage Your Enrollment</div>' +
            '<div class="wn-manage-grid">' +
                '<div class="wn-manage-card" onclick="openChangeFaculty()">' +
                    '<div class="wn-manage-icon">🔄</div>' +
                    '<div class="wn-manage-text"><h5>Change Instructor</h5><p>Switch to a different faculty for this course at any time.</p></div>' +
                '</div>' +
                '<div class="wn-manage-card" onclick="openScheduleTrial()">' +
                    '<div class="wn-manage-icon">🎯</div>' +
                    '<div class="wn-manage-text"><h5>Book Free Trial</h5><p>Join a free 30-minute intro session before committing.</p></div>' +
                '</div>' +
                '<div class="wn-manage-card" onclick="openSearchCourses()">' +
                    '<div class="wn-manage-icon">🔍</div>' +
                    '<div class="wn-manage-text"><h5>Explore More Courses</h5><p>Browse other courses in the same or different category.</p></div>' +
                '</div>' +
                '<div class="wn-manage-card danger" onclick="openUnenrollConfirm()">' +
                    '<div class="wn-manage-icon">🚪</div>' +
                    '<div class="wn-manage-text"><h5>Unenroll</h5><p>Remove yourself from this course. Access stops immediately.</p></div>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // Search more courses
        '<div class="wn-section" id="wnSearchSection" style="display:none;">' +
            '<div class="wn-section-title">Explore Other Courses</div>' +
            '<div class="wn-search-bar">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
                '<input type="text" placeholder="Search courses, topics, skills…" id="wnSearchInput">' +
            '</div>' +
            '<div class="wn-search-results-grid" id="wnSearchResultsGrid">' +
                renderWnCourseGrid(RELATED_COURSES_FOR_NEXT) +
            '</div>' +
        '</div>' +

    '</div>'; // end wn-body

    document.body.appendChild(panel);

    // Animate progress bar
    setTimeout(() => {
        const fill = document.getElementById('wnProgressFill');
        if (fill) fill.style.width = '8%'; // they just enrolled
    }, 300);

    // Back button
    document.getElementById('wnBackBtn').addEventListener('click', () => {
        panel.remove();
    });

    // Video player click
    const videoPlayer = document.getElementById('wnVideoPlayer');
    if (videoPlayer) {
        videoPlayer.addEventListener('click', () => {
            playTrialVideo(videoPlayer, course.name, course.slug);
        });
    }

    // Star picker
    const starPicker = document.getElementById('wnStarPicker');
    if (starPicker) {
        let selectedRating = 0;
        starPicker.querySelectorAll('span').forEach((star, idx) => {
            star.addEventListener('mouseenter', () => {
                starPicker.querySelectorAll('span').forEach((s, si) => {
                    s.classList.toggle('active', si <= idx);
                });
            });
            star.addEventListener('mouseleave', () => {
                starPicker.querySelectorAll('span').forEach((s, si) => {
                    s.classList.toggle('active', si < selectedRating);
                });
            });
            star.addEventListener('click', () => {
                selectedRating = idx + 1;
                starPicker.setAttribute('data-rating', selectedRating);
                starPicker.querySelectorAll('span').forEach((s, si) => {
                    s.classList.toggle('active', si < selectedRating);
                });
            });
        });
    }

    // Search input live filter
    const searchInput = document.getElementById('wnSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            const matches = q.length < 2 ? RELATED_COURSES_FOR_NEXT :
                COURSE_DETAILS.filter(c => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)).slice(0, 6).map(c => ({
                    name: c.name,
                    rating: c.rating,
                    mrp: c.mrp,
                    price: c.price,
                    img: c.img,
                    slug: c.slug
                }));
            const grid = document.getElementById('wnSearchResultsGrid');
            if (grid) grid.innerHTML = matches.length ? renderWnCourseGrid(matches) : '<p style="color:#94a3b8;font-size:0.88rem;grid-column:1/-1;">No courses found. Try a different keyword.</p>';
        });
    }

    // Store course ref for manage actions
    panel._course = course;
    panel._faculty = faculty;
}

function renderWnCourseGrid(courses) {
    return courses.map((c) => '' +
        '<div class="wn-course-card-mini" onclick="miniCardClick(\'' + c.slug + '\')">' +
            '<img class="wn-course-card-mini-img" src="' + c.img + '" alt="' + c.name + '" onerror="this.style.background=\'#1e3a8a\'">' +
            '<div class="wn-course-card-mini-body">' +
                '<h5>' + c.name + '</h5>' +
                '<div class="wn-mini-rating">⭐ ' + c.rating + '</div>' +
                '<div class="wn-mini-price">' + c.price + ' <s>' + c.mrp + '</s></div>' +
            '</div>' +
        '</div>'
    ).join('');
}

function calcSaving(mrp, price) {
    const m = parseInt(mrp.replace(/[^\d]/g, ''), 10);
    const p = parseInt(price.replace(/[^\d]/g, ''), 10);
    if (!m || !p) return '';
    return '₹' + (m - p).toLocaleString('en-IN');
}

// ---- Management action handlers ----
function openChangeFaculty() {
    const panel = document.getElementById('whatsNextPanel');
    if (!panel || !panel._course) return;
    panel.remove();
    closeCourseModal();
    setTimeout(() => openCourseModal(panel._course.slug), 50);
    setTimeout(() => {
        const fw = document.getElementById('facultySelectWrap');
        if (fw) fw.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
}

function openScheduleTrial() {
    const panel = document.getElementById('whatsNextPanel');
    if (!panel || !panel._faculty || !panel._course) return;
    openTrialConfirm(panel._faculty, panel._course);
}

function openSearchCourses() {
    const sec = document.getElementById('wnSearchSection');
    if (!sec) return;
    sec.style.display = 'block';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const inp = document.getElementById('wnSearchInput');
    if (inp) setTimeout(() => inp.focus(), 400);
}

function openUnenrollConfirm() {
    const panel = document.getElementById('whatsNextPanel');
    const course = panel ? panel._course : null;

    const el = document.createElement('div');
    el.className = 'unenroll-confirm-overlay';
    el.innerHTML = '' +
        '<div class="unenroll-confirm-card">' +
            '<div style="font-size:2rem;margin-bottom:10px;">⚠️</div>' +
            '<h3>Unenroll from this course?</h3>' +
            '<p>You\'ll lose access to all course content, lesson recordings, and mentor sessions.' +
            (course ? ' This will remove you from <strong>' + course.name + '</strong>.' : '') +
            ' This action cannot be undone.</p>' +
            '<div class="unenroll-confirm-actions">' +
                '<button class="btn-confirm-unenroll" id="confirmUnenrollBtn">Yes, Unenroll</button>' +
                '<button class="btn-cancel-unenroll" id="cancelUnenrollBtn">Keep My Spot</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(el);

    el.querySelector('#confirmUnenrollBtn').addEventListener('click', () => {
        el.remove();
        if (panel) panel.remove();
        showToast('You have been unenrolled. We hope to see you again soon.');
        if (course) {
            delete FACULTY_SELECTIONS[course.slug];
            removeEnrollment(course.slug);
            refreshEnrollButtonStates();
            updateMyCoursesBanner();
        }
    });
    el.querySelector('#cancelUnenrollBtn').addEventListener('click', () => el.remove());
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}

function miniCardClick(slug) {
    const panel = document.getElementById('whatsNextPanel');
    if (panel) panel.remove();
    setTimeout(() => openCourseModal(slug), 100);
}

function handlePayment(plan) {
    const messages = {
        monthly: '💳 Redirecting to monthly payment… Our team will follow up within 1 hour. (Demo checkout — no real charge is made.)',
        full: '🎓 Processing full course enrollment… You\'ll receive a confirmation email shortly. (Demo checkout — no real charge is made.)',
        bundle: '📞 Connecting you with our counsellors for the Job-Ready Bundle…'
    };

    // Persist the chosen plan against the course currently open in the dashboard
    const panel = document.getElementById('whatsNextPanel');
    const course = panel ? panel._course : null;
    if (course) {
        addEnrollment(course.slug, { plan: plan });
        refreshEnrollButtonStates();
        updateMyCoursesBanner();
    }

    showToast(messages[plan] || 'Processing…', 4500);
}

// ============================================================
// COMBO PACKAGE ENROLL (homepage "Combo Packages" + "Ready to Start")
// ============================================================
function handleComboEnroll(packageName) {
    if (!packageName || packageName === 'General Enrollment') {
        window.location.href = 'courses.html';
        return;
    }
    showToast('🎉 Thanks for your interest in "' + packageName + '"! Our team will contact you shortly to complete enrollment and payment.', 4500);
}

// ============================================================
// CERTIFICATE SECTION ACTIONS
// ============================================================
function scrollAndHighlight(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('nav-highlight');
    setTimeout(() => el.classList.remove('nav-highlight'), 1600);
}

// Builds a standalone SVG certificate (matching the on-page mockup) and
// downloads it as a real file — instead of opening the browser print dialog.
function handleCertDownload() {
    const studentName = (document.querySelector('.cert-name') || {}).textContent || 'Student Name';
    const courseName = (document.querySelector('.cert-course') || {}).textContent || 'Full Stack Development Program';
    const certId = (document.querySelector('.cert-id span:last-child') || {}).textContent || 'LCH-2026-FSD-00482';

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640" font-family="Georgia, 'Times New Roman', serif">
  <rect width="900" height="640" fill="#f8fafc"/>
  <rect x="24" y="24" width="852" height="592" rx="14" fill="#ffffff" stroke="#1e3a8a" stroke-width="3"/>
  <rect x="40" y="40" width="820" height="560" rx="10" fill="none" stroke="#cbd5e1" stroke-width="1"/>

  <rect x="700" y="20" width="140" height="34" rx="17" fill="#059669"/>
  <text x="770" y="42" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">&#10004; Verified</text>

  <text x="450" y="110" font-size="40" text-anchor="middle">&#127891;</text>

  <text x="450" y="150" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="#64748b" text-anchor="middle">CERTIFICATE OF COMPLETION</text>

  <text x="450" y="195" font-size="34" font-weight="800" text-anchor="middle">
    <tspan fill="#1e3a8a">LearnCraft</tspan><tspan fill="#059669">Hub</tspan>
  </text>

  <text x="450" y="240" font-family="Arial, sans-serif" font-size="15" fill="#64748b" text-anchor="middle">This certificate is proudly presented to</text>

  <text x="450" y="285" font-size="30" font-style="italic" fill="#1e293b" text-anchor="middle">${studentName}</text>
  <line x1="330" y1="298" x2="570" y2="298" stroke="#e2e8f0" stroke-width="2"/>

  <text x="450" y="330" font-family="Arial, sans-serif" font-size="15" fill="#64748b" text-anchor="middle">for successfully completing the</text>
  <text x="450" y="362" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#1e3a8a" text-anchor="middle">${courseName}</text>

  <line x1="120" y1="470" x2="320" y2="470" stroke="#94a3b8" stroke-width="1"/>
  <text x="220" y="492" font-family="Arial, sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Course Director</text>

  <line x1="580" y1="470" x2="780" y2="470" stroke="#94a3b8" stroke-width="1"/>
  <text x="680" y="492" font-family="Arial, sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Date of Issue</text>

  <line x1="60" y1="560" x2="840" y2="560" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4,4"/>
  <text x="60" y="585" font-family="Arial, sans-serif" font-size="13" fill="#94a3b8">Certificate ID</text>
  <text x="840" y="585" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="0.5" fill="#1e3a8a" text-anchor="end">${certId}</text>
</svg>`.trim();

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'LearnCraftHub-Sample-Certificate.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    scrollAndHighlight(document.querySelector('.certificate-mockup'));
}

function openCertVerifyModal() {
    scrollAndHighlight(document.querySelector('.cert-id'));
}

// ============================================================
// NEWSLETTER SUBSCRIBE ("Stay Updated!")
// ============================================================
function handleNewsletterSubscribe() {
    const input = document.getElementById('newsletterEmail');
    const email = input ? input.value.trim() : '';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
        showToast('⚠️ Please enter your email address to subscribe.', 3500);
        if (input) input.focus();
        return;
    }
    if (!emailPattern.test(email)) {
        showToast('⚠️ Please enter a valid email address.', 3500);
        if (input) input.focus();
        return;
    }

    showToast('✅ Subscribed! You\'ll now receive our latest updates.', 4000);
    input.value = '';
}

function markHelpful(btn, base) {
    btn.disabled = true;
    btn.textContent = '👍 ' + (base + 1);
    btn.style.color = '#2563eb';
    btn.style.borderColor = '#2563eb';
}

function submitReview() {
    const rating = parseInt(document.getElementById('wnStarPicker').getAttribute('data-rating') || '0', 10);
    const text = (document.getElementById('wnReviewText').value || '').trim();
    if (!rating) { showToast('Please select a star rating before submitting.'); return; }
    if (text.length < 20) { showToast('Please write at least 20 characters in your review.'); return; }
    document.getElementById('wnReviewText').value = '';
    document.getElementById('wnStarPicker').querySelectorAll('span').forEach(s => s.classList.remove('active'));
    document.getElementById('wnStarPicker').removeAttribute('data-rating');
    showToast('✓ Review submitted! Thank you for your feedback.', 4000);
}

// YouTube trial video map: course slug keywords → free tutorial video IDs
const TRIAL_VIDEO_MAP = {
    'python':         '_uQrJ0TkZlc',
    'java':           'eIrMbAQSU34',
    'c-c':            'KJgsSFOSQv0',
    'javascript':     'W6NZfCO5SIk',
    'full-stack-web': 'nu_pCVPKzTk',
    'frontend':       '0ohtVFpKgNk',
    'backend':        'Oe421EPjeBE',
    'mobile':         'VPvVD8t02U8',
    'ai-machine':     'aircAruvnKk',
    'deep-learning':  'VyWAvY2CF9c',
    'generative-ai':  'mEsleV16qdo',
    'data-analytics': 'ua-CiDNNj30',
    'data-science':   'LHBE6uBnix4',
    'cyber-security': 'hXSFdwIOfnE',
    'ethical-hacking':'2_lswM1S264',
    'cloud-computing':'M988_fsOSWo',
    'devops':         'j5Zsa_eOXeY',
    'blockchain':     'gyMwXuJrbJQ',
    'ui-ux':          'c9Wg6Cb7YVU',
    'graphic-design': 'WONZVnlam6U',
    'digital-market': 'hiRTRAqNlpE',
    'product-manage': 'yqe8K3PBBsg',
    'certificate':    'nu_pCVPKzTk',
    'default':        '_uQrJ0TkZlc'
};

function getTrialVideoId(slug) {
    if (!slug) return TRIAL_VIDEO_MAP['default'];
    for (const key of Object.keys(TRIAL_VIDEO_MAP)) {
        if (slug.includes(key)) return TRIAL_VIDEO_MAP[key];
    }
    return TRIAL_VIDEO_MAP['default'];
}

function playTrialVideo(container, courseName, slug) {
    const videoId = getTrialVideoId(slug || slugForCourse(courseName));
    const youtubeUrl = 'https://www.youtube.com/watch?v=' + videoId;
    const thumbUrl = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';

    // Directly open YouTube — no iframe embeds, no embed errors
    window.open(youtubeUrl, '_blank', 'noopener,noreferrer');

    // Show polished redirect card in the player area
    container.innerHTML =
        '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'background:linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%);text-align:center;padding:24px;gap:0;">' +
            '<div style="position:relative;width:260px;max-width:90%;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.55);margin-bottom:20px;">' +
                '<img src="' + thumbUrl + '" alt="' + courseName + '" style="width:100%;display:block;" onerror="this.src=\'\';">' +
                '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">' +
                    '<div style="width:58px;height:58px;border-radius:50%;background:#ff0000;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(255,0,0,0.55);">' +
                        '<svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<p style="color:#10b981;font-size:0.92rem;margin:0 0 4px;font-family:Lato,sans-serif;font-weight:700;">✓ Opening on YouTube…</p>' +
            '<p style="color:#94a3b8;font-size:0.8rem;margin:0 0 20px;font-family:Lato,sans-serif;">' + courseName + ' — Free Trial Lesson</p>' +
            '<a href="' + youtubeUrl + '" target="_blank" rel="noopener noreferrer" ' +
                'style="display:inline-flex;align-items:center;gap:10px;background:#ff0000;color:#fff;font-weight:700;' +
                'font-size:0.95rem;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;' +
                'box-shadow:0 4px 18px rgba(255,0,0,0.4);transition:transform 0.15s,box-shadow 0.15s;" ' +
                'onmouseover="this.style.transform=\'scale(1.04)\';this.style.boxShadow=\'0 6px 24px rgba(255,0,0,0.55)\';" ' +
                'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 4px 18px rgba(255,0,0,0.4)\';">' +
                '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.8 8.001a2.748 2.748 0 0 0-1.935-1.946C18.2 5.6 12 5.6 12 5.6s-6.2 0-7.865.455A2.748 2.748 0 0 0 2.2 8.001 28.8 28.8 0 0 0 1.75 12a28.8 28.8 0 0 0 .45 3.999 2.748 2.748 0 0 0 1.935 1.946C5.8 18.4 12 18.4 12 18.4s6.2 0 7.865-.455a2.748 2.748 0 0 0 1.935-1.946A28.8 28.8 0 0 0 22.25 12a28.8 28.8 0 0 0-.45-3.999zM9.75 15.02V8.98L15.5 12z"/></svg>' +
                'Watch on YouTube' +
            '</a>' +
        '</div>';
    container.style.cursor = 'default';
    return; // Done — everything below was the old iframe logic, now removed

    // DEAD CODE BELOW — kept as reference only, never reached
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0&modestbranding=1';
    iframe.title = courseName + ' — Free Trial Preview';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;';

    // Fallback card shown when the embed is blocked
    function showYouTubeRedirectCard() {
        container.innerHTML =
            '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                'background:linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%);text-align:center;padding:24px;gap:0;">' +

                // Thumbnail with play ring
                '<div style="position:relative;width:260px;max-width:90%;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.55);margin-bottom:20px;">' +
                    '<img src="' + thumbUrl + '" alt="' + courseName + '" style="width:100%;display:block;" onerror="this.src=\'\';">' +
                    '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">' +
                        '<div style="width:58px;height:58px;border-radius:50%;background:#ff0000;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(255,0,0,0.55);">' +
                            '<svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Message
                '<p style="color:#e2e8f0;font-size:0.92rem;margin:0 0 6px;font-family:Lato,sans-serif;">This preview plays on YouTube</p>' +
                '<p style="color:#94a3b8;font-size:0.8rem;margin:0 0 20px;font-family:Lato,sans-serif;">' + courseName + ' — Free Trial Lesson</p>' +

                // CTA button
                '<a href="' + youtubeUrl + '" target="_blank" rel="noopener" ' +
                    'style="display:inline-flex;align-items:center;gap:10px;background:#ff0000;color:#fff;font-weight:700;' +
                    'font-size:0.95rem;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;' +
                    'box-shadow:0 4px 18px rgba(255,0,0,0.4);transition:transform 0.15s,box-shadow 0.15s;" ' +
                    'onmouseover="this.style.transform=\'scale(1.04)\';this.style.boxShadow=\'0 6px 24px rgba(255,0,0,0.55)\';" ' +
                    'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 4px 18px rgba(255,0,0,0.4)\';">' +
                    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.8 8.001a2.748 2.748 0 0 0-1.935-1.946C18.2 5.6 12 5.6 12 5.6s-6.2 0-7.865.455A2.748 2.748 0 0 0 2.2 8.001 28.8 28.8 0 0 0 1.75 12a28.8 28.8 0 0 0 .45 3.999 2.748 2.748 0 0 0 1.935 1.946C5.8 18.4 12 18.4 12 18.4s6.2 0 7.865-.455a2.748 2.748 0 0 0 1.935-1.946A28.8 28.8 0 0 0 22.25 12a28.8 28.8 0 0 0-.45-3.999zM9.75 15.02V8.98L15.5 12z"/></svg>' +
                    'Watch on YouTube' +
                '</a>' +
            '</div>';
        container.style.cursor = 'default';
    }

    // Listen for embed errors (postMessage from YouTube when blocked)
    function onYTMessage(e) {
        try {
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            // YouTube sends {event:'onError', info:150/101/…} when embedding is blocked
            if (data && data.event === 'onError') {
                window.removeEventListener('message', onYTMessage);
                showYouTubeRedirectCard();
            }
        } catch (_) {}
    }
    window.addEventListener('message', onYTMessage);

    // Also catch via iframe load timeout (some browsers don't fire postMessage)
    const embedTimeout = setTimeout(function() {
        // If the iframe is in the DOM and still hasn't played, check for error state
        if (container.contains(iframe)) {
            try {
                // Accessing contentDocument throws cross-origin; that itself means it loaded OK.
                // If it's null/undefined the embed is blocked → show card.
                if (!iframe.contentDocument && !iframe.contentWindow) {
                    window.removeEventListener('message', onYTMessage);
                    showYouTubeRedirectCard();
                }
            } catch (_) {
                // Cross-origin → embed loaded, do nothing
            }
        }
        window.removeEventListener('message', onYTMessage);
    }, 5000);

    // Intercept native error event as a last resort
    iframe.addEventListener('error', function() {
        clearTimeout(embedTimeout);
        window.removeEventListener('message', onYTMessage);
        showYouTubeRedirectCard();
    });

    container.innerHTML = '';
    container.appendChild(iframe);
    container.style.cursor = 'default';

    // Proactively show the redirect card after a short delay if YouTube signals blocked
    // by watching for the iframe src redirect pattern (Error 153 / embed disabled)
    setTimeout(function() {
        try {
            const loc = iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href;
            // If we can read location it loaded fine; if it throws cross-origin it's playing OK
        } catch (crossOriginOk) {
            return; // All good — cross-origin means the embed is running
        }
        // If we reach here without throwing, the iframe loaded a same-origin page (usually an error page)
        clearTimeout(embedTimeout);
        window.removeEventListener('message', onYTMessage);
        showYouTubeRedirectCard();
    }, 3500);
}

function openCourseModal(slug) {
    const course = getCourseBySlug(slug);
    if (!course) return false;

    const modal = ensureCourseModal();
    const content = document.getElementById('courseModalContent');
    content.innerHTML = renderCourseModal(course);
    content.scrollTop = 0;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    return true;
}

function closeCourseModal() {
    const modal = document.getElementById('courseDetailModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

// Open modal when a course card is clicked (but not when the Enroll button itself is clicked)
document.querySelectorAll('.full-course-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
        if (e.target.closest('.enroll-btn')) return; // let enroll link behave normally
        const h3 = card.querySelector('h3');
        if (!h3) return;
        const slug = slugForCourse(h3.textContent.trim());
        if (getCourseBySlug(slug)) {
            e.preventDefault();
            openCourseModal(slug);
        }
    });
});

// Homepage "Popular Courses" cards — map display name to actual catalog slug
const HOME_CARD_SLUG_MAP = {
    'AI & Machine Learning': 'ai-machine-learning',
    'Full Stack Development': 'full-stack-web-development',
    'Cyber Security': 'cyber-security',
    'UI/UX & Product Design': 'ui-ux-product-design',
    'Data Analytics': 'data-analytics'
};
document.querySelectorAll('.course-card').forEach(card => {
    const h3 = card.querySelector('h3');
    const link = card.querySelector('.learn-more');
    if (!h3 || !link) return;
    const slug = HOME_CARD_SLUG_MAP[h3.textContent.trim()];
    if (!slug) return;
    link.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'courses.html?course=' + slug;
    });
});

// Re-run deep link handling: open the modal directly when ?course=slug matches known details
(function () {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('course');
    if (!slug) return;
    if (getCourseBySlug(slug)) {
        setTimeout(() => openCourseModal(slug), 200);
    }
})();
// ── SITEWIDE MOBILE NAV TOGGLE (hamburger) ──
// Works on any page with a ".navbar" containing a ".nav-toggle" button and a "nav".
document.querySelectorAll('.nav-toggle').forEach(function (toggle) {
    const navbar = toggle.closest('.navbar');
    const nav = navbar ? navbar.querySelector('nav') : null;
    if (!nav) return;

    function setOpen(open) {
        nav.classList.toggle('open', open);
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', (e) => {
        if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
            setOpen(false);
        }
    });
});
// ── SIDE NAV SCROLLSPY (highlights the section currently in view) ──
(function () {
    const sideNav = document.querySelector('.side-nav');
    if (!sideNav) return;

    const links = Array.from(sideNav.querySelectorAll('a.side-nav-link[href^="#"]'));
    if (!links.length) return;

    const sections = links
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    function setActive(id) {
        links.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setActive(entry.target.id);
            }
        });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

    sections.forEach(section => observer.observe(section));
})();
// ── IN-PAGE CATEGORY DETAIL REVEAL (courses.html) — grid swaps out for the detail view, same page ──
(function () {
    const openBtns = document.querySelectorAll('.cat-learn-more-btn');
    const grid = document.getElementById('courseCatGrid');
    if (!openBtns.length || !grid) return;

    function openPanel(target) {
        const panel = document.getElementById('detail-' + target);
        if (!panel) return;

        /* lock the viewport to this spot before the grid dissolves */
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });

        grid.classList.add('grid-hidden');
        setTimeout(() => {
            grid.style.display = 'none';
            panel.style.display = 'block';
            void panel.offsetWidth; // restart the reveal animation every time it opens
            requestAnimationFrame(() => panel.classList.add('active'));
        }, 300);
    }

    function closePanel(panel) {
        if (!panel) return;
        panel.classList.remove('active');
        setTimeout(() => {
            panel.style.display = 'none';
            grid.style.display = '';
            void grid.offsetWidth;
            requestAnimationFrame(() => grid.classList.remove('grid-hidden'));
            grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

    openBtns.forEach(btn => {
        btn.addEventListener('click', () => openPanel(btn.dataset.target));
    });

    document.querySelectorAll('.course-detail-panel .detail-back-btn').forEach(btn => {
        btn.addEventListener('click', () => closePanel(btn.closest('.course-detail-panel')));
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.course-detail-panel.active').forEach(closePanel);
        }
    });
})();

// ── TESTIMONIAL SLIDER (prev/next arrows) ──
(function () {
    const slider = document.querySelector('.testimonial-slider');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    if (!slider || !prevBtn || !nextBtn) return;

    function scrollByOneCard(direction) {
        const card = slider.querySelector('.testimonial-card');
        if (!card) return;
        const gap = parseFloat(getComputedStyle(slider).gap) || 18;
        const amount = card.getBoundingClientRect().width + gap;
        slider.scrollBy({ left: direction * amount, behavior: 'smooth' });
    }

    prevBtn.addEventListener('click', () => scrollByOneCard(-1));
    nextBtn.addEventListener('click', () => scrollByOneCard(1));
})();
