// ============================================================
// DropZone Ambient Animations — v2 Premium
// Particles with glow, mouse interaction, tilt, ripple
// ============================================================

(function () {
    'use strict';

    // ─── PARTICLE CANVAS ──────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    let mouseX = -1000, mouseY = -1000;
    const MOUSE_RADIUS = 180;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
    window.addEventListener('mouseleave', ()  => { mouseX = -1000; mouseY = -1000; });

    const COLORS = [
        { r: 59,  g: 130, b: 246 }, // blue
        { r: 99,  g: 102, b: 241 }, // indigo
        { r: 139, g: 92,  b: 246 }, // violet
        { r: 16,  g: 185, b: 129 }, // emerald
        { r: 148, g: 163, b: 184 }, // slate
    ];

    const particles = [];
    const PARTICLE_COUNT = Math.min(90, Math.floor(window.innerWidth / 18));
    const CONNECTION_DIST = 140;

    function randomParticle() {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const size = Math.random() * 1.6 + 0.5;
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: size,
            baseR: size,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.22,
            alpha: Math.random() * 0.45 + 0.15,
            color,
            pulseSpeed: Math.random() * 0.018 + 0.006,
            pulseT: Math.random() * Math.PI * 2,
        };
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(randomParticle());
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.pulseT += p.pulseSpeed;

            // Wrap edges
            if (p.x < -10) p.x = canvas.width + 10;
            if (p.x > canvas.width + 10) p.x = -10;
            if (p.y < -10) p.y = canvas.height + 10;
            if (p.y > canvas.height + 10) p.y = -10;

            // Mouse repulsion
            const mdx = p.x - mouseX;
            const mdy = p.y - mouseY;
            const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mDist < MOUSE_RADIUS && mDist > 0) {
                const force = (1 - mDist / MOUSE_RADIUS) * 1.8;
                p.x += (mdx / mDist) * force;
                p.y += (mdy / mDist) * force;
                p.r = p.baseR + force * 0.5; // swell near mouse
            } else {
                p.r += (p.baseR - p.r) * 0.08; // ease back
            }

            const alpha = p.alpha + Math.sin(p.pulseT) * 0.1;
            const a = Math.max(0, Math.min(1, alpha));
            const { r, g, b } = p.color;

            // Glow layer
            if (p.r > 1) {
                const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
                grd.addColorStop(0, `rgba(${r},${g},${b},${a * 0.15})`);
                grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();
            }

            // Core dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.fill();
        }

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i];
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONNECTION_DIST) {
                    const alpha = (1 - dist / CONNECTION_DIST) * 0.14;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
                    ctx.lineWidth = 0.7;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(drawParticles);
    }

    drawParticles();

    // ─── MORPHING ANIMATED LINE DECORATORS ────────────────────
    function injectLineDecorators() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.35;z-index:0;border-radius:28px;overflow:hidden;';
        svg.setAttribute('aria-hidden', 'true');

        const lines = [
            { x1: '0%', y1: '20%', x2: '30%', y2: '0%',   delay: '0s'  },
            { x1: '100%', y1: '80%', x2: '70%', y2: '100%', delay: '1.2s'  },
            { x1: '10%', y1: '100%', x2: '40%', y2: '70%',  delay: '2.4s'  },
            { x1: '90%', y1: '0%',   x2: '60%', y2: '30%',  delay: '0.6s'},
        ];

        lines.forEach(l => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', l.x1); line.setAttribute('y1', l.y1);
            line.setAttribute('x2', l.x2); line.setAttribute('y2', l.y2);
            line.setAttribute('stroke', 'rgba(59,130,246,0.35)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '60');
            line.setAttribute('stroke-dashoffset', '60');

            line.style.animation = `lineFlow 4s ease-in-out ${l.delay} infinite`;
            svg.appendChild(line);
        });

        dropZone.style.position = 'relative';
        dropZone.insertBefore(svg, dropZone.firstChild);
    }

    // ─── CARD 3D TILT ─────────────────────────────────────────
    function initCardTilt() {
        const card = document.querySelector('.card');
        if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let targetX = 0, targetY = 0;
        let currentX = 0, currentY = 0;

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            targetX = -(e.clientY - cy) / rect.height * 3.5;
            targetY = (e.clientX - cx) / rect.width * 3.5;
        });

        card.addEventListener('mouseleave', () => {
            targetX = 0; targetY = 0;
        });

        function animate() {
            currentX += (targetX - currentX) * 0.06;
            currentY += (targetY - currentY) * 0.06;

            const shadow = `0 ${48 + currentX}px 120px -24px rgba(0,0,0,0.95)`;
            card.style.transform = `perspective(1400px) rotateX(${currentX}deg) rotateY(${currentY}deg)`;
            card.style.boxShadow = shadow;

            requestAnimationFrame(animate);
        }
        animate();
    }

    // ─── RIPPLE EFFECT ────────────────────────────────────────
    function addRipple(el) {
        el.addEventListener('click', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const ripple = document.createElement('span');
            ripple.style.cssText = `
                position:absolute;
                border-radius:50%;
                background:rgba(255,255,255,0.22);
                transform:scale(0);
                animation:rippleAnim 0.55s ease-out;
                width:140px;height:140px;
                left:${x - 70}px;top:${y - 70}px;
                pointer-events:none;
                z-index:10;
            `;
            el.style.position = 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    }

    // Inject keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rippleAnim {
            to { transform: scale(3.5); opacity: 0; }
        }
        @keyframes lineFlow {
            0%   { stroke-dashoffset: 60; opacity: 0; }
            20%  { opacity: 0.7; }
            100% { stroke-dashoffset: -60; opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // ─── TOAST NOTIFICATION ───────────────────────────────────
    let toastEl = null;
    let toastTimer = null;

    window.showToast = function (message, type = 'default', duration = 3000) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }

        const icons = {
            success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
            error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
            default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        };

        toastEl.className = `toast ${type}`;
        toastEl.innerHTML = `${icons[type] || icons.default}<span>${message}</span>`;

        clearTimeout(toastTimer);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { toastEl.classList.add('show'); });
        });

        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, duration);
    };

    // ─── ANIMATED STATUS LABEL TYPEWRITER ─────────────────────
    window.animateStatusLabel = function (el, text) {
        if (!el) return;
        let i = 0;
        el.textContent = '';
        const interval = setInterval(() => {
            el.textContent += text[i++];
            if (i >= text.length) clearInterval(interval);
        }, 22);
    };

    // ─── SCROLL REVEALS ───────────────────────────────────────
    function initScrollReveals() {
        const rows = document.querySelectorAll('.feature-row');
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal');
                }
            });
        }, observerOptions);

        rows.forEach(row => observer.observe(row));
    }

    // ─── INIT ALL ─────────────────────────────────────────────
    function init() {
        injectLineDecorators();
        initCardTilt();
        initScrollReveals();

        // Ensure main card stays prominent on start
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Add ripple to all action buttons
        document.querySelectorAll('.browse-btn, .copy-btn, .submit-btn, .tab-btn, .reconnect-btn').forEach(addRipple);

        // Staggered session items animation
        const observer = new MutationObserver(() => {
            document.querySelectorAll('.session-item:not([data-animated])').forEach((el, i) => {
                el.dataset.animated = '1';
                el.style.animationDelay = `${i * 80}ms`;
            });
            // Re-apply ripple to dynamically created buttons
            document.querySelectorAll('.reconnect-btn:not([data-ripple])').forEach(el => {
                el.dataset.ripple = '1';
                addRipple(el);
            });
        });

        const sessionsList = document.getElementById('sessionsList');
        if (sessionsList) observer.observe(sessionsList, { childList: true });

        // Animate progress label changes
        const origUpdateP2P = window.updateP2PStatus;
        if (typeof origUpdateP2P === 'function') {
            // Hook handled in script.js
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
