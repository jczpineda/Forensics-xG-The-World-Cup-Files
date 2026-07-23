# -*- coding: utf-8 -*-
"""
ETL: match-event feeds  ->  compact analytics JSON for the dashboard.

Auto-discovers every 2026 World Cup match-event feed in the source folder (104 for the
complete tournament) and computes: metadata and scores, line-ups + formations, shots
with a geometric xG proxy, passing networks and average positions, possession,
defensive actions, an expected-threat surface fitted to the tournament itself, derived
carries, goal/card/sub timelines, momentum, and per-player stat tables.

Feeds are NOT included in this repository — they are licensed commercial event data.
Point WC_FEEDS at your own licensed copy:

    WC_FEEDS=/path/to/feeds python etl.py
"""
import json, glob, os, math
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.abspath(__file__))
# folder of match-event JSON feeds; every World Cup file in it is picked up
SRC = os.environ.get('WC_FEEDS',
                     os.path.join(os.path.expanduser('~'), 'Downloads', 'wc2026_feeds'))
OUT = os.environ.get('WC_OUT', os.path.join(BASE, 'data.json'))

# ---- provider reference maps ----------------------------------------------------
TYPE = {1:'pass',2:'offside_pass',3:'take_on',4:'foul',5:'out',6:'corner_awarded',
        7:'tackle',8:'interception',9:'turnover',10:'save',11:'claim',12:'clearance',
        13:'miss',14:'post',15:'attempt_saved',16:'goal',17:'card',18:'sub_off',
        19:'sub_on',34:'team_set_up',40:'formation_change',41:'punch',44:'aerial',
        45:'challenge',49:'ball_recovery',50:'dispossessed',51:'error',52:'keeper_pickup',
        54:'end',55:'discontinued',56:'card2',61:'ball_touch',74:'blocked_pass'}

# formation id -> human formation
FORMATION = {2:'4-4-2',3:'4-1-2-1-2',4:'4-3-3',5:'4-5-1',6:'4-4-1-1',7:'4-1-4-1',
    8:'4-2-3-1',9:'4-3-2-1',10:'5-3-2',11:'5-4-1',12:'3-5-2',13:'3-4-3',14:'3-1-3-1-2',
    15:'4-2-2-2',16:'3-5-1-1',17:'3-4-2-1',18:'3-4-1-2',19:'3-1-4-2',20:'4-3-3',
    21:'4-1-3-2',22:'4-2-4',23:'4-3-1-2',24:'3-2-3-2',25:'3-3-3-1'}

# Position slot (provider 131) -> role group. 1=GK, 2-5 def, 6-8 mid, 9-11 att (approx)
def pos_group(slot, formation=''):
    # The provider's formation slot is the traditional position number, NOT a depth ordering.
    # Verified against median pitch position pooled over all 208 team-matches:
    #   1 GK (x 11.8) | 2 RB, 3 LB (x ~52, wide) | 5, 6 CB (x ~37, central)
    #   4 CM (x 47.9, central) | 8 CM (x 51.0) | 10 CAM (x 60.8)
    #   7 RW (x 59.8) | 9 ST (x 62.0) | 11 LW (x 63.2)
    # The old table put slot 4 in DEF (it is a central midfielder — this is why
    # Declan Rice read as a defender) and slot 7 in MID while its mirror, slot 11,
    # was FWD.
    slot=int(slot)
    # bench players carry slot 0 — they have no formation position at all, and
    # falling through to 'FWD' silently labelled all 254 of them forwards
    if slot==0: return 'SUB'
    if slot==1: return 'GK'
    if slot in (2,3,5,6): return 'DEF'   # RB, LB, CB, CB
    if slot in (4,8): return 'MID'       # CM, CM
    if slot == 9: return 'FWD'           # ST
    if slot == 10:
        # Slot 10 is a second striker in a front-TWO system but an attacking
        # midfielder behind a lone striker — and the two sit at the SAME average
        # position (~60), so geometry cannot tell them apart. The formation can: the
        # last number in the formation string is the forward line, so ending in "-2"
        # means two strikers and the 10 is one of them (Messi, J. David in 4-4-2 ->
        # FWD); anything else has the 10 in the attacking-mid band (Bruno Fernandes,
        # De Bruyne, Bellingham in 4-2-3-1 -> MID).
        return 'FWD' if str(formation).split('-')[-1] == '2' else 'MID'
    # Slots 7 and 11 (the wide berths) still can't be split by a table — they hold
    # out-and-out wingers (Yamal 72.4, Dembele 69.2 avg x) and central midfielders
    # pushed wide (De Paul 53.0, Gravenberch 58.2). Resolved later by nearest centroid.
    return 'AMB'

BODY = {15:'Head',72:'Left foot',20:'Right foot',21:'Other'}

# ---- helpers ----------------------------------------------------------------
def load(fp):
    b = open(fp, 'rb').read()
    raw = None
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
        try:
            raw = b.decode(enc); break
        except Exception:
            continue
    s = raw.lstrip('﻿ \t\r\n')
    # clean JSON (API _fmt=json) starts with { or [ ; JSONP is  W<hash>( {...} )
    if s[:1] in '{[':
        return json.loads(s)
    i = raw.find('('); j = raw.rfind(')')
    try:
        return json.loads(raw[i+1:j])
    except Exception:
        return json.loads(raw)

def quals(e):
    return {q['qualifierId']: q.get('value') for q in e.get('qualifier', [])}

# Geometric xG model (the feed carries no native xG). Pitch 105x68, attack toward x=100.
PITCH_L, PITCH_W = 105.0, 68.0
GOAL_HALF = 7.32/2.0  # 3.66 m

def shot_geom(x, y):
    """(angle subtended by the goal, distance to goal centre in metres)."""
    px = x/100.0*PITCH_L
    py = y/100.0*PITCH_W
    dx = max(PITCH_L - px, 0.15)
    dy = py - PITCH_W/2.0
    dist = math.hypot(dx, dy)
    a = math.atan2(GOAL_HALF*2*dx, dx*dx + dy*dy - GOAL_HALF*GOAL_HALF)
    if a < 0:
        a += math.pi
    return a, dist

# Coefficients are FITTED to this tournament's own shot outcomes by maximum likelihood
# (see fit_xg below) rather than hand-tuned to chosen anchors. The values here are a
# sane prior used only if the fit cannot run; fit_xg overwrites them at startup.
#   [intercept, angle, distance, header, free-kick]
XG_W = [-1.6252, 1.8153, -0.0753, -1.2475, -0.35]

def xg_proxy(x, y, is_head, is_pen, is_fk):
    if is_pen:
        return 0.76
    a, dist = shot_geom(x, y)
    z = (XG_W[0] + XG_W[1]*a + XG_W[2]*dist
         + XG_W[3]*(1.0 if is_head else 0.0) + XG_W[4]*(1.0 if is_fk else 0.0))
    return max(0.005, min(0.97, 1.0/(1.0+math.exp(-max(-30.0, min(30.0, z))))))

def fit_xg(samples, iters=60):
    """Newton/IRLS logistic fit on [angle, distance, header, free-kick] -> goal.

    Replaces the previous approach of hand-picking coefficients and then applying a
    single global multiplier (K_CAL) so the totals reconciled. That multiplier hid a
    real shape error: the hand-tuned curve was too steep in distance, over-predicting
    close-range shots and under-predicting from 22-30m by more than 2x, while the
    tournament total still looked perfectly calibrated because the errors cancelled.
    A fitted logistic is calibrated band by band AND self-calibrating in total, so it
    also removes the need to refit K_CAL by hand whenever matches are added.
    """
    global XG_W
    if len(samples) < 200:
        return None
    X = [[1.0, a, dist, hd, fk] for a, dist, hd, fk, _ in samples]
    Y = [g for _, _, _, _, g in samples]
    n = 5
    w = [0.0]*n
    for _ in range(iters):
        grad = [0.0]*n
        H = [[0.0]*n for _ in range(n)]
        for xi, yi in zip(X, Y):
            z = sum(a*b for a, b in zip(w, xi))
            p = 1.0/(1.0+math.exp(-max(-30.0, min(30.0, z))))
            r = yi - p
            wt = max(p*(1.0-p), 1e-6)
            for i in range(n):
                grad[i] += r*xi[i]
                for j in range(n):
                    H[i][j] += wt*xi[i]*xi[j]
        for i in range(n):
            H[i][i] += 1e-4                      # ridge, keeps the solve stable
        A = [H[i][:] + [grad[i]] for i in range(n)]
        for c in range(n):                       # Gaussian elimination w/ pivoting
            piv = max(range(c, n), key=lambda r: abs(A[r][c]))
            A[c], A[piv] = A[piv], A[c]
            if abs(A[c][c]) < 1e-12:
                return None
            for r in range(n):
                if r == c:
                    continue
                f = A[r][c]/A[c][c]
                for k in range(c, n+1):
                    A[r][k] -= f*A[c][k]
        delta = [A[i][n]/A[i][i] for i in range(n)]
        w = [w[i] + delta[i] for i in range(n)]
        if max(abs(v) for v in delta) < 1e-9:
            break
    XG_W = w
    return w

# ---- pitch zones (attacking direction: x 0=own goal, 100=opponent goal) -----
# 5-lane model so zone 14 and the half-spaces tile cleanly (no overlap):
#   wide 0-21 | half-space 21-36.8 | central 36.8-63.2 | half-space 63.2-79 | wide 79-100
def in_box(x, y):   return x >= 83   and 21.0 <= y <= 79.0
def in_z14(x, y):   return 66.7 <= x < 83 and 36.8 <= y <= 63.2   # zone 14 = central lane
# provider y runs 0-100 across the pitch with 0 on the attacking team's RIGHT (verified
# against players whose flank is known), so the LOW-y band is the right half-space.
def in_hsR(x, y):   return x >= 66.7 and 21.0 <= y < 36.8         # right half-space
def in_hsL(x, y):   return x >= 66.7 and 63.2 < y <= 79.0         # left half-space
# on-ball actions that count as a "touch" for heatmaps
TOUCH = {1,2,3,7,8,10,11,12,13,14,15,16,41,44,45,49,50,52,61,74}
# events that stop play — after any of these the ball is dead, so the next on-ball
# action is a restart, not a carry (2 offside, 4 foul, 5 out, 6 corner awarded,
# 16 goal, 17 card, 18/19 subs, 27/28 delay, 30 end, 32 start, 40 formation change,
# 55 offside provoked, 58 penalty faced)
DEADBALL = {2,4,5,6,16,17,18,19,20,27,28,30,32,40,55,58}
HX, HY = 12, 8         # heatmap grid (cols x rows)

def fmt_min(e):
    return int(e.get('timeMin', 0))

# Football-clock model. the feed's timeMin runs into stoppage (a 45th-minute event can
# read 47) while the next period restarts at its nominal mark, so raw timeMin is not
# monotonic and cannot be used for minutes played. Clamping each period to its
# nominal length turns wall-clock into football minutes.
PERIOD_START = {1: 0, 2: 45, 3: 90, 4: 105}
PERIOD_LEN   = {1: 45, 2: 45, 3: 15, 4: 15}
def clock_min(e):
    p = e.get('periodId') or 1
    if p not in PERIOD_START:
        return int(e.get('timeMin', 0))
    st = PERIOD_START[p]
    return st + min(max(int(e.get('timeMin', 0)) - st, 0), PERIOD_LEN[p])

# ---- per-match processing ---------------------------------------------------
def process(fp):
    d = load(fp)
    mi = d['matchInfo']; ld = d['liveData']
    md = ld.get('matchDetails', {})
    events = ld.get('event', [])

    contestants = mi.get('contestant', [])
    home = next((c for c in contestants if c.get('position')=='home'), contestants[0])
    away = next((c for c in contestants if c.get('position')=='away'), contestants[1])
    hid, aid = home['id'], away['id']

    def side(cid):
        return 'home' if cid==hid else 'away'

    scores = md.get('scores', {})
    ft = scores.get('ft', {}); ht = scores.get('ht', {})
    # The feed's `ft` is the score at the end of NORMAL time. A tie won in extra time
    # therefore looks drawn unless we take `et`. Do NOT use `total`: for a shootout
    # it folds the penalties into the scoreline (1-1 becomes 4-5).
    et = scores.get('et') or {}
    pen = scores.get('pen') or {}
    final = et if et else ft

    # player name map + shirt map (from events)
    pname = {}
    for e in events:
        if e.get('playerId') and e.get('playerName'):
            pname[e['playerId']] = e['playerName']

    # ---- lineups & formations from team_set_up (typeId 34), earliest per team
    lineups = {'home': None, 'away': None}
    for e in events:
        if e.get('typeId') != 34:
            continue
        s = side(e.get('contestantId'))
        if lineups[s] is not None:
            continue
        q = quals(e)
        pids = [p.strip() for p in str(q.get(30,'')).split(',') if p.strip()]
        shirts = [p.strip() for p in str(q.get(59,'')).split(',') if p.strip()]
        slots = [p.strip() for p in str(q.get(131,'')).split(',') if p.strip()]
        fid = q.get(130)
        cap = q.get(194)
        try:
            fname = FORMATION.get(int(fid), str(fid))
        except Exception:
            fname = '—'
        players = []
        for idx, pid in enumerate(pids):
            slot = slots[idx] if idx < len(slots) else str(idx+1)
            players.append({
                'id': pid,
                'name': pname.get(pid, '—'),
                'shirt': shirts[idx] if idx < len(shirts) else '',
                'slot': slot,
                'group': pos_group(slot, fname) if slot.isdigit() else 'SUB',
                'captain': (pid==cap),
                'starter': idx < 11,
            })
        lineups[s] = {'formation': fname, 'players': players}

    # ---- aggregation containers
    team = {h: defaultdict(float) for h in ('home','away')}
    pstat = defaultdict(lambda: defaultdict(float))   # playerId -> stat -> val
    pteam = {}                                        # playerId -> side
    pos_sum = defaultdict(lambda: [0.0,0.0,0])        # playerId -> [sumx,sumy,n] (passes)
    shots = []
    timeline = []
    pass_links = defaultdict(float)                   # (side,a,b)->count
    momentum = []                                     # {min, side, xg, type}

    last_pass = {'home': None, 'away': None}          # for pass-link chaining
    tac = {'home': defaultdict(float), 'away': defaultdict(float)}   # tactical accumulators
    pmin_on, pmin_off = {}, {}                         # sub on/off minutes -> player minutes
    pmin_red = {}                                      # dismissal minute -> ends that player's match
    periods_played = set()                             # {1,2} or {1,2,3,4} if extra time
    last_ev_min = 0
    # ---- spatial layers ----
    heat = {'home': [0]*(HX*HY), 'away': [0]*(HX*HY)}   # touch density grid
    pheat = {'home': defaultdict(lambda: [0]*(HX*HY)),  # per-player touch grid
             'away': defaultdict(lambda: [0]*(HX*HY))}
    passlist = {'home': [], 'away': []}                 # [pid, x, y, ex, ey, flags]
    carrylist = {'home': [], 'away': []}                # [pid, x, y, ex, ey] (derived)
    prev_ball = None                                    # (side, x, y) where the ball rests
    cur_period = None                                   # carries must not cross a period
    touch_x = {}                                        # pid -> [sum of touch x, n] (position inference)
    def_zones = defaultdict(list)                       # pid -> [mirrored zone of each ball-winning action]
    zone = {'home': defaultdict(float), 'away': defaultdict(float)}
    z14_by_player = {'home': defaultdict(int), 'away': defaultdict(int)}
    last_team_ev = {'home': None, 'away': None}         # for xA (shot-assist derivation)

    for e in events:
        t = e.get('typeId')
        cid = e.get('contestantId')
        if cid not in (hid, aid):
            continue
        # exclude penalty shootout (periodId 5) & post-match markers from analytics;
        # normal time + extra time (periods 1-4) only. Final score comes from matchDetails.
        if (e.get('periodId') or 1) >= 5:
            continue
        ep = e.get('periodId') or 1
        periods_played.add(ep)
        # the ball does not "carry" across a half or through a stoppage: reset the
        # resting position on a period change and on any dead-ball event, otherwise
        # the last touch of a half carries into the first touch of the next one and
        # a blocked shot carries to the corner flag
        if ep != cur_period:
            cur_period = ep
            prev_ball = None
        if t in DEADBALL:
            prev_ball = None
        s = side(cid)
        pid = e.get('playerId')
        if pid:
            pteam[pid] = s
        q = quals(e)
        x = e.get('x'); y = e.get('y')
        outcome = e.get('outcome', 0)
        mn = fmt_min(e)
        if mn > last_ev_min: last_ev_min = mn

        # pass end coordinates (needed by both the pass list and carry tracking)
        exf = eyf = None
        if t == 1:
            try: exf = float(q.get(140)) if q.get(140) is not None else None
            except Exception: exf = None
            try: eyf = float(q.get(141)) if q.get(141) is not None else None
            except Exception: eyf = None

        # ---- spatial layers: heatmap bins, zone occupancy, carries ----
        if t in TOUCH and x is not None and y is not None:
            # a carry = the ball moved from where it came to rest to where this
            # action starts, with the same team still in possession
            if pid and prev_ball and prev_ball[0] == s:
                d = math.hypot(x-prev_ball[1], y-prev_ball[2])
                if 3.0 <= d <= 60.0:
                    carrylist[s].append([pid, prev_ball[1], prev_ball[2], x, y])
            gx = min(int(x/100*HX), HX-1); gy = min(int(y/100*HY), HY-1)
            cell = gy*HX+gx
            heat[s][cell] += 1
            if pid:
                pheat[s][pid][cell] += 1
                tx = touch_x.setdefault(pid, [0.0, 0])
                tx[0] += x; tx[1] += 1
            if in_z14(x,y):
                zone[s]['z14_touch'] += 1
                if pid: z14_by_player[s][pid] += 1
            if in_hsL(x,y): zone[s]['hsL_touch'] += 1
            if in_hsR(x,y): zone[s]['hsR_touch'] += 1
            if in_box(x,y): zone[s]['box_touch'] += 1
            if x >= 66.7:   zone[s]['f3_touch'] += 1
            # where the ball ends up after this action
            if t == 1 and outcome == 1 and exf is not None and eyf is not None:
                prev_ball = (s, exf, eyf)
            else:
                prev_ball = (s, x, y)

        if t == 1 and x is not None and y is not None:    # pass -> store for pass map
            if exf is not None and eyf is not None:
                ok = 1 if outcome == 1 else 0
                prog = 1 if (ok and exf-x >= 15 and exf >= 50) else 0
                intoF3 = 1 if (ok and x < 66.7 <= exf) else 0
                intoBox = 1 if (ok and not in_box(x,y) and in_box(exf,eyf)) else 0
                into14 = 1 if (ok and not in_z14(x,y) and in_z14(exf,eyf)) else 0
                intoHS = 1 if (ok and (in_hsL(exf,eyf) or in_hsR(exf,eyf))
                               and not (in_hsL(x,y) or in_hsR(x,y))) else 0
                flags = ok | (prog<<1) | (intoF3<<2) | (intoBox<<3) | (into14<<4) | (intoHS<<5)
                passlist[s].append([pid, round(x), round(y), round(exf), round(eyf), flags])
                if into14:  zone[s]['z14_in'] += 1
                if intoBox: zone[s]['box_in'] += 1
                if in_hsL(exf,eyf) and ok: zone[s]['hsL_in'] += 1
                if in_hsR(exf,eyf) and ok: zone[s]['hsR_in'] += 1

        # ---- xA: credit the shot's xG to the player who made the immediately
        # preceding completed pass for the same team (shot-assist derivation) ----
        if t in (13,14,15,16) and (28 not in q):
            prev = last_team_ev[s]
            if prev and prev[0] != pid:
                xg_tmp = xg_proxy(x or 50, y or 50, 15 in q, 9 in q, (26 in q) or (25 in q))
                pstat[prev[0]]['xa'] += xg_tmp
        last_team_ev[s] = (pid, mn) if (t == 1 and outcome == 1 and pid) else None

        # ---- tactical accumulators (independent of the main stat chain) ----
        if t == 1:                                        # pass
            if x is not None and x <= 60: tac[s]['pass_own60'] += 1
            if x is not None and x >= 66.7:
                tac[s]['ft_pass'] += 1
                ey = q.get(141)
                try: eyf = float(ey) if ey is not None else y
                except Exception: eyf = y
                if eyf is not None:
                    # low y is the attacking team's RIGHT — this was inverted
                    if eyf < 33.3: tac[s]['att_R'] += 1
                    elif eyf > 66.7: tac[s]['att_L'] += 1
                    else: tac[s]['att_C'] += 1
            if 1 in q: tac[s]['long'] += 1               # qualifier 1 = long ball
        # ---- ball-winning actions, for player xT prevented -----------------------
        # The feed records coordinates in the ACTING team's attacking frame, so the threat
        # the opponent held at that spot lives at the mirrored point (100-x, 100-y).
        # Storing the zone now; it gets valued once the xT surface is fitted.
        if pid and x is not None and y is not None and (
                (t == 7 and outcome == 1) or t in (8, 12, 49)):
            mgx = min(int((100-x)/100*HX), HX-1)
            mgy = min(int((100-y)/100*HY), HY-1)
            def_zones[pid].append(mgy*HX + mgx)

        if (t in (7,8,45)) or (t==4 and outcome==0):     # pressing actions (att 60%)
            if x is not None and x >= 40: tac[s]['defact_att60'] += 1
        if (t in (7,8,12,49)) or (t==4 and outcome==0):  # def-action height
            if x is not None: tac[s]['defx_sum'] += x; tac[s]['defx_n'] += 1
        if t == 19 and pid: pmin_on[pid] = clock_min(e)
        if t == 18 and pid: pmin_off[pid] = clock_min(e)
        # red (32 = second yellow, 33 = straight red) ends that player's match
        if t == 17 and pid and ({32, 33} & set(q)): pmin_red[pid] = clock_min(e)

        if t == 1:  # pass
            team[s]['pass'] += 1
            if outcome == 1:
                team[s]['pass_ok'] += 1
            if pid:
                pstat[pid]['pass'] += 1
                if outcome == 1:
                    pstat[pid]['pass_ok'] += 1
                if x is not None:
                    pos_sum[pid][0] += x; pos_sum[pid][1] += y; pos_sum[pid][2] += 1
            # progressive / final third
            ex = q.get(140);
            try:
                exf = float(ex) if ex is not None else None
            except Exception:
                exf = None
            if outcome==1 and exf is not None and x is not None:
                if exf-x >= 15 and exf >= 50:
                    team[s]['prog_pass'] += 1
                    if pid: pstat[pid]['prog_pass'] += 1
                if x < 66.7 <= exf:
                    team[s]['final_third'] += 1
            # assist
            if q.get(210) is not None or 210 in q:
                pass
            # pass link chaining (completed passes, same-team consecutive)
            if outcome==1 and pid:
                prev = last_pass[s]
                if prev and prev != pid:
                    a,b = sorted([prev,pid])
                    pass_links[(s,a,b)] += 1
                last_pass[s] = pid
        elif t in (13,14,15,16) and (28 not in q):  # shots (own goals excluded — see timeline)
            is_goal = (t==16)
            is_head = 15 in q
            is_pen = 9 in q
            is_fk = (26 in q) or (25 in q)
            own = False
            xg = xg_proxy(x or 50, y or 50, is_head, is_pen, is_fk)
            blocked = (t==15 and 82 in q)               # shot blocked by an outfielder
            on_target = is_goal or (t==15 and not blocked)
            body = next((BODY[b] for b in (15,72,20,21) if b in q), 'Right foot')
            shots.append({'side': s, 'pid': pid, 'name': pname.get(pid,'—'),
                          'x': x, 'y': y, 'min': mn, 'goal': is_goal,
                          'on_target': on_target, 'blocked': blocked, 'xg': round(xg,3),
                          'body': body, 'pen': is_pen, 'head': is_head, 'own': own})
            team[s]['shots'] += 1
            if on_target: team[s]['sot'] += 1
            if blocked: team[s]['blocked'] += 1
            team[s]['xg'] += xg
            # open play is not just qualifier 22: fast breaks (23) and throw-ins (160)
            # carry no set-piece qualifier either, and lumping them in put 247 open-play
            # shots in the set-piece bucket — a 10-point error on set-piece xG share.
            if {22, 23, 160} & set(q): tac[s]['op_xg'] += xg
            else: tac[s]['sp_xg'] += xg                 # corner / free kick / penalty
            if pid:
                pstat[pid]['shots'] += 1
                pstat[pid]['xg'] += xg
                if not is_pen:
                    pstat[pid]['npxg'] += xg
                    pstat[pid]['npshots'] += 1
            momentum.append({'min': mn, 'side': s, 'xg': xg, 'goal': is_goal})
            if is_goal and not own:
                if pid:
                    pstat[pid]['goals'] += 1
                    if not is_pen: pstat[pid]['npgoals'] += 1
                team[s]['goals_ev'] += 1
        elif t == 3:   # take on (dribble)
            team[s]['dribble'] += 1
            if outcome==1:
                team[s]['dribble_ok'] += 1
                if pid: pstat[pid]['dribble_ok'] += 1
        elif t == 7:   # tackle
            team[s]['tackle'] += 1
            if pid: pstat[pid]['tackle'] += 1
        elif t == 8:   # interception
            team[s]['interception'] += 1
            if pid: pstat[pid]['interception'] += 1
        elif t == 12:  # clearance
            team[s]['clearance'] += 1
            if pid: pstat[pid]['clearance'] += 1
        elif t == 49:  # ball recovery
            team[s]['recovery'] += 1
            if pid: pstat[pid]['recovery'] += 1
        elif t == 44:  # aerial duel
            team[s]['aerial'] += 1
            if outcome==1:
                team[s]['aerial_ok'] += 1
                if pid: pstat[pid]['aerial_ok'] += 1
        elif t == 4:   # foul (outcome 0 = foul won by this player's team)
            if outcome==0:
                team[s]['foul'] += 1
                if pid: pstat[pid]['foul'] += 1
        elif t == 6:   # corner awarded — the feed logs this TWICE, once for the team
            # taking it (outcome 1) and once for the team conceding it (outcome 0).
            # Counting both gave every side corners-for plus corners-against, i.e.
            # 18.4 per match against a true 9.2.
            if outcome == 1:
                team[s]['corner'] += 1
        elif t == 10:  # save (goalkeeper)
            team[s]['save'] += 1
            if pid: pstat[pid]['save'] += 1

        # timeline events
        if t == 16:
            scorer = pname.get(pid,'—')
            own = 28 in q
            # an own goal counts for the opponent — attribute it to that side
            gside = ('away' if s=='home' else 'home') if own else s
            # own goals are correctly kept out of `shots`, but they still counted for
            # the benefiting side, so credit goals_ev here rather than leaving the
            # event-derived team goal total 14 short of the real one
            if own: team[gside]['goals_ev'] += 1
            timeline.append({'min': mn, 'type':'goal','side': gside,'player':scorer,
                             'pen': 9 in q, 'own': own})
        elif t == 17:  # card
            card = 'yellow'
            if 33 in q: card='red'
            if 32 in q: card='second_yellow'
            timeline.append({'min': mn,'type':'card','side': s,
                             'player':pname.get(pid,'—'),'card':card})
        elif t == 19:  # sub on
            timeline.append({'min': mn,'type':'sub','side': s,
                             'player':pname.get(pid,'—')})

    # ---- possession (completed-pass share) & finalize team stats
    for s in ('home','away'):
        team[s]['pass_pct'] = round(100*team[s]['pass_ok']/team[s]['pass'],1) if team[s]['pass'] else 0
        team[s]['aerial_pct'] = round(100*team[s]['aerial_ok']/team[s]['aerial'],1) if team[s]['aerial'] else 0
        team[s]['dribble_pct'] = round(100*team[s]['dribble_ok']/team[s]['dribble'],1) if team[s]['dribble'] else 0
    # ensure a consistent stat schema on both teams
    STAT_KEYS = ['pass','pass_ok','pass_pct','prog_pass','final_third','shots','sot',
                 'blocked','xg','goals_ev','dribble','dribble_ok','dribble_pct','tackle',
                 'interception','clearance','recovery','aerial','aerial_ok','aerial_pct',
                 'foul','corner','save']
    for s in ('home','away'):
        for k in STAT_KEYS:
            team[s].setdefault(k, 0)
    tot_ok = team['home']['pass_ok'] + team['away']['pass_ok']
    for s in ('home','away'):
        team[s]['possession'] = round(100*team[s]['pass_ok']/tot_ok,1) if tot_ok else 50.0
        team[s]['xg'] = round(team[s]['xg'],2)

    # ---- tactical metrics (style profile) ----
    match_min = md.get('matchLengthMin') or last_ev_min or 95
    tot_ft = tac['home']['ft_pass'] + tac['away']['ft_pass']
    tactical = {}
    for s in ('home','away'):
        o = 'away' if s=='home' else 'home'
        attn = tac[s]['att_L']+tac[s]['att_C']+tac[s]['att_R']
        tactical[s] = {
            # pressing: opponent passes in their own 60% per team defensive action there (low = intense)
            'ppda': round(tac[o]['pass_own60']/max(tac[s]['defact_att60'],1),1),
            # avg x of defensive actions (high = aggressive line/press)
            'def_height': round(tac[s]['defx_sum']/tac[s]['defx_n'],1) if tac[s]['defx_n'] else 0,
            # directness: share of passes that are long balls
            'long_pct': round(100*tac[s]['long']/team[s]['pass'],1) if team[s]['pass'] else 0,
            # field tilt: share of both teams' final-third passes
            'field_tilt': round(100*tac[s]['ft_pass']/tot_ft,1) if tot_ft else 50.0,
            # attacking channels (final-third passes L/C/R)
            'att_left': round(100*tac[s]['att_L']/attn) if attn else 33,
            'att_center': round(100*tac[s]['att_C']/attn) if attn else 34,
            'att_right': round(100*tac[s]['att_R']/attn) if attn else 33,
            # set-piece vs open-play xG
            'sp_xg': round(tac[s]['sp_xg'],2), 'op_xg': round(tac[s]['op_xg'],2),
            # tempo: passes attempted per minute
            'tempo': round(team[s]['pass']/match_min,2),
        }

    # ---- average positions (for pass network) — starters with >=8 passes
    def avg_positions(s):
        out = {}
        lu = lineups[s]
        starters = {p['id'] for p in (lu['players'] if lu else []) if p['starter']}
        for pid,(sx,sy,n) in pos_sum.items():
            # Starters only, as the heading says. This filter was missing: substitutes
            # with >=8 passes were kept, links to them survived into the top 14, but the
            # renderer only draws starter nodes -- so those links hung off the network
            # with nothing on the end. Filtering here also fixes the top-14 selection,
            # since links are built from whoever is in this dict.
            if pteam.get(pid)!=s or n < 8 or pid not in starters: continue
            out[pid] = {'x': round(sx/n,1),'y': round(sy/n,1),'n': n,
                        'name': pname.get(pid,'—'),
                        'starter': True,
                        'passes': int(pstat[pid]['pass'])}
        return out
    net_pos = {'home': avg_positions('home'), 'away': avg_positions('away')}
    # top pass links per side (both endpoints have a position)
    links = {'home': [], 'away': []}
    for (s,a,b),c in pass_links.items():
        if a in net_pos[s] and b in net_pos[s] and c>=3:
            links[s].append({'a':a,'b':b,'c':int(c)})
    for s in links:
        links[s].sort(key=lambda z:-z['c'])
        links[s] = links[s][:14]

    # ---- momentum: smoothed net xG per minute bucket (5-min windows)
    buckets = {}
    for m in momentum:
        b = (m['min']//5)*5
        buckets.setdefault(b, {'home':0.0,'away':0.0})
        buckets[b][m['side']] += m['xg']
    mom = [{'min': b,'home': round(v['home'],3),'away': round(v['away'],3)}
           for b,v in sorted(buckets.items())]

    # ---- player minutes (from starter status + sub on/off + dismissals) ----
    # matchLengthMin is WALL CLOCK: it includes stoppage, so it runs 99-108 for a
    # normal-time match and 130-144 with extra time. Crediting that to an unsubbed
    # starter inflated every per-90 rate in the dashboard by 5-26%, and by a
    # different amount per match -- which silently broke cross-player comparison.
    # Minutes are now on the football clock: 90, or 120 when extra time was played.
    end_min = 120 if periods_played & {3, 4} else 90
    def minutes(pid, started):
        on = 0 if started else pmin_on.get(pid)
        if on is None: on = pmin_off.get(pid, end_min)  # rare: no sub-on logged
        # a dismissal ends the player's match; without this a red card at 32'
        # was still credited the full 90+
        off = min(pmin_off.get(pid, end_min), pmin_red.get(pid, end_min))
        return max(0, min(round(off - on), end_min))

    # ---- player table rows (sorted by involvement)
    def player_rows(s):
        rows = []
        lu = lineups[s]
        order = {p['id']: i for i,p in enumerate(lu['players'])} if lu else {}
        seen = set()
        for pid,st in pstat.items():
            if pteam.get(pid)!=s: continue
            seen.add(pid)
            lup = next((p for p in (lu['players'] if lu else []) if p['id']==pid), {})
            started = lup.get('starter', False)
            rows.append({
                'id': pid,'name': pname.get(pid,'—'),
                'shirt': lup.get('shirt',''),'group': lup.get('group','SUB'),
                'starter': started,'captain': lup.get('captain', False),
                'min': minutes(pid, started),
                'goals': int(st['goals']),'shots': int(st['shots']),'xg': round(st['xg'],2),
                'npg': int(st['npgoals']),'npxg': round(st['npxg'],2),'xa': round(st['xa'],2),
                'passes': int(st['pass']),'pass_ok': int(st['pass_ok']),
                'pass_pct': round(100*st['pass_ok']/st['pass'],0) if st['pass'] else 0,
                'prog': int(st['prog_pass']),'tackles': int(st['tackle']),
                'intercept': int(st['interception']),'recov': int(st['recovery']),
                'clear': int(st['clearance']),'dribbles': int(st['dribble_ok']),
                'aerials': int(st['aerial_ok']),'saves': int(st['save']),
                'fouls': int(st['foul']),
            })
        rows.sort(key=lambda r:(not r['starter'], order.get(r['id'],99)))
        return rows

    # ---- spatial layers: map player ids -> index into the players array ----
    rows_home, rows_away = player_rows('home'), player_rows('away')
    pidx = {'home': {r['id']: i for i,r in enumerate(rows_home)},
            'away': {r['id']: i for i,r in enumerate(rows_away)}}
    passes_out, pheat_out, zones_out, carries_out, defz_out = {}, {}, {}, {}, {}
    for s in ('home','away'):
        # ball-winning actions, flat 2 per entry: [playerIdx, mirrored zone]
        dz = []
        for pid_, zs in def_zones.items():
            if pteam.get(pid_) != s: continue
            i = pidx[s].get(pid_, -1)
            if i < 0: continue
            for z in zs: dz.extend([i, z])
        defz_out[s] = dz
        # flat array, 6 values per pass: [playerIdx, x, y, endX, endY, flags]
        flat = []
        for p in passlist[s]:
            flat.extend([pidx[s].get(p[0], -1)] + p[1:])
        passes_out[s] = flat
        # carries, flat 5 per entry: [playerIdx, x, y, endX, endY]
        cf = []
        for c in carrylist[s]:
            cf.extend([pidx[s].get(c[0], -1), round(c[1],1), round(c[2],1), round(c[3],1), round(c[4],1)])
        carries_out[s] = cf
        for r in (rows_home if s=='home' else rows_away):
            r['carries'] = 0
        for c in carrylist[s]:
            i = pidx[s].get(c[0], -1)
            if i >= 0: (rows_home if s=='home' else rows_away)[i]['carries'] += 1
        # per-player heat, sparse: flat [cellIndex, count, ...] for non-zero cells
        pheat_out[s] = {}
        for k, grid in pheat[s].items():
            if k not in pidx[s] or sum(grid) < 15: continue
            sparse = []
            for ci, c in enumerate(grid):
                if c: sparse.extend([ci, c])
            pheat_out[s][str(pidx[s][k])] = sparse
        z = dict(zone[s])
        top = sorted(z14_by_player[s].items(), key=lambda kv:-kv[1])[:5]
        z['top14'] = [[pidx[s].get(k,-1), n] for k,n in top if k in pidx[s]]
        zones_out[s] = z

    stage = mi.get('stage',{}).get('name','')
    venue = mi.get('venue',{})
    return {
        'id': mi.get('id'),
        'date': mi.get('date','')[:10],
        'localDate': mi.get('localDate',''),
        'stage': stage,
        'group': mi.get('series',{}).get('name','') if stage=='Group Stage' else '',
        'venue': venue.get('longName',''),
        'home': {'id':hid,'name':home['name'],'code':home.get('code',''),
                 'formation': (lineups['home'] or {}).get('formation','—')},
        'away': {'id':aid,'name':away['name'],'code':away.get('code',''),
                 'formation': (lineups['away'] or {}).get('formation','—')},
        # 'ft' is the score the match finished at (after extra time if it was played);
        # 'reg' keeps the 90-minute score, 'aet' marks a tie decided in extra time,
        # and 'pens' is the actual shootout result rather than something inferred
        # from "drew and yet somebody won".
        'score': {'ft':[final.get('home',0),final.get('away',0)],
                  'ht':[ht.get('home',0),ht.get('away',0)],
                  'reg':[ft.get('home',0),ft.get('away',0)],
                  'aet': bool(et) and not pen,
                  'pens':([pen.get('home',0),pen.get('away',0)] if pen else None)},
        'winner': md.get('winner',''),
        'lengthMin': md.get('matchLengthMin'),
        'teamStats': {'home': dict(team['home']),'away': dict(team['away'])},
        'tactical': tactical,
        'heat': heat,
        'pheat': pheat_out,
        'passes': passes_out,
        '_carries': carries_out,        # dropped after xT is computed (size)
        '_defz': defz_out,              # dropped after xT prevented is computed
        '_avgx': {k: [round(v[0], 1), v[1]] for k, v in touch_x.items()},   # dropped after positions
        '_saves': {k: int(v.get('save', 0)) for k, v in pstat.items() if v.get('save')},
        'zones': zones_out,
        'lineups': lineups,
        'shots': shots,
        'timeline': sorted(timeline, key=lambda z:z['min']),
        'netPos': net_pos,
        'links': links,
        'momentum': mom,
        'players': {'home': rows_home,'away': rows_away},
    }

# ---- run --------------------------------------------------------------------
# Auto-discover EVERY 2026 FIFA World Cup match-event file under SRC (recursively).
# Any feed you drop in the folder is picked up automatically; no need to list filenames.
# Matches are identified by competition name and season, and de-duplicated by match id
# (so the same game saved twice counts once). Set WC_TMCL to a tournament-calendar id to
# tighten the filter; without it the competition name and 2026 season are enough.
WC_TMCL = os.environ.get('WC_TMCL', '')

def is_wc(d):
    mi = d.get('matchInfo', {})
    comp = mi.get('competition', {}).get('name', '')
    tmcl = mi.get('tournamentCalendar', {})
    return ('World Cup' in comp) and (
        tmcl.get('id') == WC_TMCL or '2026' in tmcl.get('name', ''))

candidates = []
for root, _dirs, files in os.walk(SRC):
    depth = root[len(SRC):].count(os.sep)
    if depth > 2:
        continue
    for fn in files:
        if fn.lower().endswith('.json'):
            candidates.append(os.path.join(root, fn))

# ---- pass 1: fit the xG model to this tournament's own shot outcomes ----------
# Only shot geometry and outcome are read here, both independent of the model itself,
# so there is no circularity. Penalties are excluded (fixed 0.76) and own goals are
# not shots. Feeds are parsed and discarded one at a time to keep memory flat.
def _fit_pass(paths):
    samples = []
    for fp_ in paths:
        try:
            dd = load(fp_)
        except Exception:
            continue
        if not dd or 'matchInfo' not in dd or not is_wc(dd):
            continue
        for e in dd.get('liveData', {}).get('event', []):
            t_ = e.get('typeId')
            if t_ not in (13, 14, 15, 16):
                continue
            if (e.get('periodId') or 1) >= 5:            # shootout, not open play
                continue
            q_ = {q['qualifierId'] for q in e.get('qualifier', [])}
            if 9 in q_ or 28 in q_:                      # penalty / own goal
                continue
            x_, y_ = e.get('x'), e.get('y')
            if x_ is None or y_ is None:
                continue
            a_, d_ = shot_geom(x_, y_)
            samples.append((a_, d_, 1.0 if 15 in q_ else 0.0,
                            1.0 if (26 in q_ or 25 in q_) else 0.0,
                            1.0 if t_ == 16 else 0.0))
    return samples

_samples = _fit_pass(candidates)
_w = fit_xg(_samples)
if _w:
    print('xG model fitted on %d non-penalty shots:' % len(_samples))
    print('   z = %.4f + %.4f*angle %+.4f*dist %+.4f*header %+.4f*freekick'
          % tuple(_w))
else:
    print('xG fit skipped (too few shots) — using prior coefficients')

matches = []
seen_ids = set()
scanned = 0
for fp in candidates:
    try:
        d = load(fp)
    except Exception:
        continue
    if not d or 'matchInfo' not in d or not is_wc(d):
        continue
    scanned += 1
    mid = d['matchInfo'].get('id')
    if mid in seen_ids:
        continue
    seen_ids.add(mid)
    try:
        matches.append(process(fp))
        print('ok  ', os.path.basename(fp))
    except Exception as ex:
        import traceback; traceback.print_exc(); print('FAIL', fp, ex)

print('\nDiscovered %d World Cup files -> %d unique matches' % (scanned, len(matches)))

# ============================ Expected Threat (xT) ==========================
# Karun Singh's model, fitted to THIS tournament's data rather than borrowing a
# published grid. For each zone z:
#   xT(z) = P(shoot|z)*P(goal|shot from z) + P(move|z) * Σ T(z→z') * xT(z')
# solved by value iteration. Moves are completed passes (the feed has no carry
# events); P(goal|shot) comes from the calibrated xG model at the zone centroid.
GXn, GYn = HX, HY                      # 12 x 8 zones, same grid as the heatmaps
def zid(x, y):
    gx = min(int(x/100*GXn), GXn-1); gy = min(int(y/100*GYn), GYn-1)
    return gy*GXn + gx

def build_xt(ms, iters=80):
    N = GXn*GYn
    moves = [0.0]*N; shots = [0.0]*N
    T = [defaultdict(float) for _ in range(N)]
    for m in ms:
        for s in ('home','away'):
            a = m['passes'][s]
            for i in range(0, len(a), 6):
                z0 = zid(a[i+1], a[i+2])
                moves[z0] += 1                 # ALL attempts (denominator)
                if a[i+5] & 1:                 # only completions carry value on
                    T[z0][zid(a[i+3], a[i+4])] += 1
                # incomplete passes leak probability mass -> turnover, value 0.
                # Without this leak the iteration converges to a flat surface.
            c = m['_carries'][s]               # carries/dribbles also move the ball
            for i in range(0, len(c), 5):
                z0 = zid(c[i+1], c[i+2])
                moves[z0] += 1
                T[z0][zid(c[i+3], c[i+4])] += 1
        for sh in m['shots']:
            if sh.get('x') is None: continue
            shots[zid(sh['x'], sh['y'])] += 1
    # P(goal | shot from zone) from the calibrated model at each zone centroid
    g = []
    for z in range(N):
        cx = (z % GXn + 0.5)/GXn*100; cy = (z//GXn + 0.5)/GYn*100
        g.append(xg_proxy(cx, cy, False, False, False))
    xt = [0.0]*N
    for _ in range(iters):
        nxt = [0.0]*N
        for z in range(N):
            tot = moves[z] + shots[z]
            if tot == 0:
                continue
            ps = shots[z]/tot; pm = moves[z]/tot
            acc = 0.0
            if moves[z]:
                for z2, c in T[z].items():
                    acc += c/moves[z] * xt[z2]
            nxt[z] = ps*g[z] + pm*acc
        xt = nxt
    return xt

XT = build_xt(matches)
print('xT surface: min %.4f  max %.4f  (own box -> opp box)' % (min(XT), max(XT)))

# credit every completed pass AND every carry with the change in zone value,
# and build a per-zone map of where each team adds threat from
for m in matches:
    m['xt'] = {}; m['xtz'] = {}
    for s in ('home','away'):
        tot = 0.0
        per_player = defaultdict(float)
        per_player_carry = defaultdict(float)
        zgrid = [0.0]*(GXn*GYn)
        a = m['passes'][s]
        for i in range(0, len(a), 6):
            if not (a[i+5] & 1):
                continue
            z0 = zid(a[i+1], a[i+2])
            d = XT[zid(a[i+3], a[i+4])] - XT[z0]
            tot += d; per_player[a[i]] += d; zgrid[z0] += d
        c = m['_carries'][s]
        for i in range(0, len(c), 5):
            z0 = zid(c[i+1], c[i+2])
            d = XT[zid(c[i+3], c[i+4])] - XT[z0]
            tot += d; per_player[c[i]] += d; per_player_carry[c[i]] += d; zgrid[z0] += d
        m['xt'][s] = round(tot, 3)
        m['xtz'][s] = [round(v, 4) for v in zgrid]
        for p in m['players'][s]:
            p['xt'] = 0.0; p['xtc'] = 0.0
        for idx, v in per_player.items():
            if 0 <= idx < len(m['players'][s]):
                m['players'][s][idx]['xt'] = round(v, 3)
        for idx, v in per_player_carry.items():
            if 0 <= idx < len(m['players'][s]):
                m['players'][s][idx]['xtc'] = round(v, 3)

        # ---- xT prevented: value every ball-winning action by the threat the
        # opponent held where it happened. Winning the ball there extinguishes that
        # threat, so a clearance off your own line is worth far more than a recovery
        # in the opposition half — which is the whole point of weighting by xT
        # rather than counting tackles.
        for p in m['players'][s]:
            p['xtp'] = 0.0
        dz = m['_defz'][s]
        for i in range(0, len(dz), 2):
            idx, z = dz[i], dz[i+1]
            if 0 <= idx < len(m['players'][s]) and 0 <= z < len(XT):
                m['players'][s][idx]['xtp'] += XT[z]
        for p in m['players'][s]:
            p['xtp'] = round(p['xtp'], 3)
    del m['_carries']                 # keep the shipped file small
    del m['_defz']

# ---- positions for players who never start -------------------------------------
# qualifier 131 (formation slot) is 0 for everyone on the bench, and pos_group(0)
# fell through to 'FWD', so the lineup group is only trustworthy for the starting XI.
# The app therefore left 254 players with no position at all, and ranked them against
# a bogus 8-player "SUB" peer pool.
# Fix: learn each position's average touch-x from the starters, whose positions we do
# know, then classify every unpositioned player by nearest centroid — the same
# real-average-x logic the formation lines already rely on.
avgx_sum, avgx_n, saves_tot = defaultdict(float), defaultdict(int), defaultdict(int)
starter_group, sub_ids = {}, set()
start_votes = defaultdict(Counter)
for m in matches:
    for pid, (sx, n) in m['_avgx'].items():
        avgx_sum[pid] += sx; avgx_n[pid] += n
    for pid, sv in m['_saves'].items():
        saves_tot[pid] += sv
    for s in ('home', 'away'):
        for p in m['players'][s]:
            sub_ids.add(p['id'])
            if p.get('starter') and p.get('group') and p['group'] != 'SUB':
                # most common across their starts, not the first one seen: a player can
                # legitimately fill different slots in different matches
                start_votes[p['id']][p['group']] += 1
avg_of = lambda pid: (avgx_sum[pid] / avgx_n[pid]) if avgx_n[pid] else None

# Centroids come from the UNAMBIGUOUS slots only, so the wide berths can be measured
# against a clean reference before they are folded in.
# Centroids for resolving the wide slots (7, 11). Built from the unambiguous starts —
# slot 10 has already been settled to MID or FWD by formation at parse time, so it
# contributes to whichever group it landed in, keeping the MID reference anchored on
# real attacking midfielders rather than only the deep pivots.
cent = {}
for g in ('GK', 'DEF', 'MID', 'FWD'):
    vals = [avg_of(p) for p, v in start_votes.items()
            if v and max(v, key=v.get) == g and avg_of(p) is not None]
    if vals: cent[g] = sum(vals) / len(vals)

# Resolve each player's ambiguous starts to MID or FWD by their real average position,
# then fold those back in as votes. Resolving BEFORE the modal vote matters: a forward
# with six ambiguous starts and one in a central slot must not be called a midfielder on
# the strength of that single start.
amb_fixed = defaultdict(int)
for pid_, votes in start_votes.items():
    n_amb = votes.pop('AMB', 0)
    if not n_amb: continue
    a = avg_of(pid_)
    g = ('MID' if a is None or not {'MID', 'FWD'} <= set(cent)
         else min(('MID', 'FWD'), key=lambda gg: abs(cent[gg] - a)))
    votes[g] += n_amb; amb_fixed[g] += 1
print('resolved %d ambiguous-slot starters by average position: %s'
      % (sum(amb_fixed.values()), dict(amb_fixed)))

for pid_, votes in start_votes.items():
    if votes: starter_group[pid_] = votes.most_common(1)[0][0]
sub_ids -= set(starter_group)     # whatever remains never started, so has no slot
print('\nposition centroids from starters (avg touch x): ' +
      ', '.join('%s %.1f' % (g, c) for g, c in sorted(cent.items(), key=lambda kv: kv[1])))

inferred = defaultdict(int)
for pid in sub_ids:
    a = avg_of(pid)
    if a is None:
        continue                                   # no touches at all — leave unknown
    # a goalkeeper who came on is identified by keeping, not by geometry alone
    g = 'GK' if saves_tot.get(pid) else min(
        (gg for gg in cent if gg != 'GK'), key=lambda gg: abs(cent[gg] - a))
    starter_group[pid] = g
    inferred[g] += 1
print('inferred a position for %d substitutes: %s' %
      (sum(inferred.values()), dict(inferred)))

# write the canonical position onto every appearance row
unknown = 0
for m in matches:
    for s in ('home', 'away'):
        for p in m['players'][s]:
            g = starter_group.get(p['id'])
            if g: p['group'] = g
            elif p.get('group', 'SUB') == 'SUB': unknown += 1
    del m['_avgx']; del m['_saves']
print('appearances still without a position: %d' % unknown)

# order chronologically
matches.sort(key=lambda m: (m['date'], m['id']))
out = {'generated': '2026-07-20', 'tournament': '2026 FIFA World Cup',
       'host': 'Canada / Mexico / USA',
       'xtGrid': [round(v, 5) for v in XT], 'xtDims': [GXn, GYn],
       'matches': matches}
json.dump(out, open(OUT,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('\nWROTE', OUT, os.path.getsize(OUT), 'bytes;', len(matches), 'matches')
