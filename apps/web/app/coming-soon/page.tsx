import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gifteeng — Coming Soon",
  description: "Something special is on its way. Gifteeng — Engineer Your Emotions.",
};

export default function ComingSoonPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0a14;
            color: #fff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            overflow: hidden;
          }

          /* Ambient glow */
          .glow {
            position: fixed;
            border-radius: 50%;
            filter: blur(120px);
            opacity: 0.18;
            pointer-events: none;
          }
          .glow-1 { width: 600px; height: 600px; background: #e11d48; top: -200px; left: -100px; }
          .glow-2 { width: 500px; height: 500px; background: #7c3aed; bottom: -150px; right: -100px; }

          .card {
            position: relative;
            z-index: 10;
            text-align: center;
            max-width: 560px;
            width: 100%;
          }

          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(225,29,72,0.12);
            border: 1px solid rgba(225,29,72,0.25);
            border-radius: 100px;
            padding: 6px 16px;
            font-size: 12px;
            font-weight: 600;
            color: #f43f5e;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 32px;
          }
          .badge-dot {
            width: 6px; height: 6px;
            background: #f43f5e;
            border-radius: 50%;
            animation: pulse 1.5s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.8); }
          }

          .logo {
            width: 160px;
            margin: 0 auto 20px;
            filter: brightness(0) invert(1);
          }

          h1 {
            font-size: clamp(36px, 8vw, 64px);
            font-weight: 900;
            line-height: 1.05;
            letter-spacing: -0.03em;
            margin-bottom: 16px;
            background: linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: clamp(15px, 3vw, 18px);
            color: rgba(255,255,255,0.45);
            line-height: 1.6;
            margin-bottom: 48px;
          }
          .subtitle span { color: rgba(255,255,255,0.7); }

          /* Countdown */
          .countdown {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 48px;
          }
          .count-box {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            padding: 20px 24px;
            min-width: 80px;
          }
          .count-num {
            font-size: 36px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: -0.03em;
          }
          .count-label {
            font-size: 10px;
            color: rgba(255,255,255,0.35);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 6px;
          }
          .count-sep {
            font-size: 28px;
            font-weight: 800;
            color: rgba(255,255,255,0.2);
            margin-bottom: 20px;
          }

          /* Email form */
          .form {
            display: flex;
            gap: 10px;
            max-width: 400px;
            margin: 0 auto 40px;
          }
          .form input {
            flex: 1;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 12px;
            padding: 14px 18px;
            font-size: 14px;
            color: #fff;
            outline: none;
            transition: border-color 0.2s;
          }
          .form input::placeholder { color: rgba(255,255,255,0.3); }
          .form input:focus { border-color: rgba(225,29,72,0.5); }
          .form button {
            background: #e11d48;
            border: none;
            border-radius: 12px;
            padding: 14px 22px;
            font-size: 14px;
            font-weight: 700;
            color: #fff;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.2s, transform 0.1s;
          }
          .form button:hover { background: #be123c; transform: translateY(-1px); }
          .form button:active { transform: translateY(0); }

          .footnote {
            font-size: 12px;
            color: rgba(255,255,255,0.2);
          }

          /* Floating gifts */
          .floaters {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1;
          }
          .floater {
            position: absolute;
            font-size: 28px;
            opacity: 0.07;
            animation: float linear infinite;
          }
          @keyframes float {
            from { transform: translateY(110vh) rotate(0deg); opacity: 0; }
            10%  { opacity: 0.07; }
            90%  { opacity: 0.07; }
            to   { transform: translateY(-10vh) rotate(360deg); opacity: 0; }
          }
        `}</style>
        <script dangerouslySetInnerHTML={{__html: `
          // Countdown timer
          function tick() {
            var launch = new Date('2025-06-01T00:00:00');
            var now = new Date();
            var diff = Math.max(0, launch - now);
            var d = Math.floor(diff / 86400000);
            var h = Math.floor((diff % 86400000) / 3600000);
            var m = Math.floor((diff % 3600000) / 60000);
            var s = Math.floor((diff % 60000) / 1000);
            var pad = function(n){ return String(n).padStart(2,'0'); };
            var el = function(id, v){ var e=document.getElementById(id); if(e) e.textContent=pad(v); };
            el('cd-d', d); el('cd-h', h); el('cd-m', m); el('cd-s', s);
          }
          document.addEventListener('DOMContentLoaded', function(){
            tick();
            setInterval(tick, 1000);

            // Floating emojis
            var emojis = ['🎁','🎀','💝','🎊','✨','🎉','💌','🌸'];
            var container = document.querySelector('.floaters');
            for(var i=0;i<12;i++){
              (function(i){
                var el = document.createElement('span');
                el.className = 'floater';
                el.textContent = emojis[i % emojis.length];
                el.style.left = (Math.random()*100)+'%';
                el.style.animationDuration = (12+Math.random()*18)+'s';
                el.style.animationDelay = (Math.random()*15)+'s';
                el.style.fontSize = (20+Math.random()*24)+'px';
                container.appendChild(el);
              })(i);
            }

            // Subscribe form
            document.getElementById('sub-form').addEventListener('submit', function(e){
              e.preventDefault();
              var btn = document.getElementById('sub-btn');
              btn.textContent = 'Done! 🎉';
              btn.style.background = '#059669';
              document.getElementById('sub-email').value = '';
              setTimeout(function(){ btn.textContent = 'Notify me'; btn.style.background=''; }, 3000);
            });
          });
        `}} />
      </head>
      <body>
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="floaters" />

        <div className="card">
          <div className="badge">
            <span className="badge-dot" />
            Launching Soon
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/main-logo.svg" alt="Gifteeng" className="logo" />

          <h1>Something Special<br />Is Coming</h1>

          <p className="subtitle">
            <span>Engineer Your Emotions.</span><br />
            Premium personalised gifts — crafted with love,<br />delivered across India.
          </p>

          {/* Countdown */}
          <div className="countdown">
            <div className="count-box">
              <div className="count-num" id="cd-d">00</div>
              <div className="count-label">Days</div>
            </div>
            <div className="count-sep">:</div>
            <div className="count-box">
              <div className="count-num" id="cd-h">00</div>
              <div className="count-label">Hours</div>
            </div>
            <div className="count-sep">:</div>
            <div className="count-box">
              <div className="count-num" id="cd-m">00</div>
              <div className="count-label">Mins</div>
            </div>
            <div className="count-sep">:</div>
            <div className="count-box">
              <div className="count-num" id="cd-s">00</div>
              <div className="count-label">Secs</div>
            </div>
          </div>

          {/* Email subscribe */}
          <form className="form" id="sub-form">
            <input id="sub-email" type="email" placeholder="Enter your email" required />
            <button type="submit" id="sub-btn">Notify me</button>
          </form>

          <p className="footnote">No spam. We'll only write when we launch. 🎁</p>
        </div>
      </body>
    </html>
  );
}
