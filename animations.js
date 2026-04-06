// ============================================================
// DropZone Ambient Animations
// Particles, tilt, ripple, morphing background
// ============================================================

(function () {
    'use strict';

    // ─── PARTICLE CANVAS ──────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const COLORS = [
        'rgba(59,130,246,',   // blue
        'rgba(99,102,241,',   // indigo
        'rgba(16,185,129,',   // green
        'rgba(148,163,184,',  // slate
    ];

    const particles = [];
    const PARTICLE_COUNT = Math.min(80, Math.floor(window.innerWidth / 20));

    function randomParticle() {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.4,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.25,
            alpha: Math.random() * 0.5 + 0.1,
            color,
            pulseSpeed: Math.random() * 0.02 + 0.005,
            pulseT: Math.random() * Math.PI * 2,
        };
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(randomParticle());
    }

    const CONNECTION_DIST = 130;

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update + draw particles
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.pulseT += p.pulseSpeed;

            // Wrap edges
            if (p.x < -10) p.x = canvas.width + 10;
            if (p.x > canvas.width + 10) p.x = -10;
            if (p.y < -10) p.y = canvas.height + 10;
            if (p.y > canvas.height + 10) p.y = -10;

            const alpha = p.alpha + Math.sin(p.pulseT) * 0.08;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color + Math.max(0, Math.min(1, alpha)) + ')';
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
                    const alpha = (1 - dist / CONNECTION_DIST) * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
                    ctx.lineWidth = 0.8;
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
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.4;z-index:0;border-radius:24px;overflow:hidden;';
        svg.setAttribute('aria-hidden', 'true');

        const lines = [
            { x1: '0%', y1: '20%', x2: '30%', y2: '0%',   delay: '0s'  },
            { x1: '100%', y1: '80%', x2: '70%', y2: '100%', delay: '1s'  },
            { x1: '10%', y1: '100%', x2: '40%', y2: '70%',  delay: '2s'  },
            { x1: '90%', y1: '0%',   x2: '60%', y2: '30%',  delay: '0.5s'},
        ];

        lines.forEach(l => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', l.x1); line.setAttribute('y1', l.y1);
            line.setAttribute('x2', l.x2); line.setAttribute('y2', l.y2);
            line.setAttribute('stroke', 'rgba(59,130,246,0.3)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '60');
            line.setAttribute('stroke-dashoffset', '60');

            line.style.animation = `lineFlow 3.5s ease-in-out ${l.delay} infinite`;
            svg.appendChild(line);
        });

        dropZone.style.position = 'relative';
        dropZone.insertBefore(svg, dropZone.firstChild);
    }

    // ─── CARD 3D TILT ─────────────────────────────────────────
    function initCardTilt() {
        const card = document.querySelector('.card');
        if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let raf;
        let targetX = 0, targetY = 0;
        let currentX = 0, currentY = 0;

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            targetX = -(e.clientY - cy) / rect.height * 4;
            targetY = (e.clientX - cx) / rect.width * 4;
        });

        card.addEventListener('mouseleave', () => {
            targetX = 0; targetY = 0;
        });

        function animate() {
            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;

            const shadow = `0 ${48 + currentX}px 120px -24px rgba(0,0,0,0.95)`;
            card.style.transform = `perspective(1200px) rotateX(${currentX}deg) rotateY(${currentY}deg)`;
            card.style.boxShadow = shadow;

            raf = requestAnimationFrame(animate);
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
                background:rgba(255,255,255,0.25);
                transform:scale(0);
                animation:rippleAnim 0.6s linear;
                width:120px;height:120px;
                left:${x - 60}px;top:${y - 60}px;
                pointer-events:none;
                z-index:10;
            `;
            el.style.position = 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 700);
        });
    }

    // Inject ripple keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rippleAnim {
            to { transform: scale(3); opacity: 0; }
        }
        @keyframes lineFlow {
            0%   { stroke-dashoffset: 60; opacity: 0; }
            20%  { opacity: 0.8; }
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
            success: '✓',
            error:   '✕',
            default: '●',
        };

        toastEl.className = `toast ${type}`;
        toastEl.innerHTML = `<span style="font-size:16px;">${icons[type] || icons.default}</span><span>${message}</span>`;

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
        }, 24);
    };

    // ─── INIT ALL ─────────────────────────────────────────────
    function init() {
        injectLineDecorators();
        initCardTilt();

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
