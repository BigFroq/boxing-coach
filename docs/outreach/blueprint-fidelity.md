# Blueprint Fidelity — Eval Baseline

**Run started:** 2026-07-20T10:15:57.788Z  
**Run completed:** 2026-07-20T13:00:00.364Z  
**Chat endpoint:** `http://localhost:3100/api/chat`  
**Raw results:** `docs/outreach/eval-results.json`

This report is regenerated every time the eval runs. The JSON sidecar has the full detail; this file is the human-readable summary for the pre-outreach plan.

---

## Summary

- **Layer 3 (Answer Quality):** avg 4.37/5 across 38 queries
  - accuracy 4.32 · voice 4.76 · groundedness 3.95 · actionability 4.45 · myth 4.92

### Delta vs. baseline (pre-judge-fix)

The baseline scored the coach against a rubric that penalized the product for not citing sources it's explicitly forbidden to cite. The fixed rubric uses retrieved chunks as ground truth and scores groundedness as methodological fidelity.

| Dimension | Baseline | Current | Δ |
|---|---|---|---|
| accuracy | 4.00 | 4.32 | +0.32 |
| voice | 4.00 | 4.76 | +0.76 |
| groundedness | 2.00 | 3.95 | +1.95 |
| actionability | 3.80 | 4.45 | +0.65 |
| myth_correction | 4.10 | 4.92 | +0.82 |

## Layer 3 — Answer Quality (per query)

Scored 1–5 on accuracy, voice, groundedness, actionability, myth correction.

### How does Canelo Alvarez use his jab?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **5** · myth N/A
- Judge reasoning: The coach response is tightly grounded in the retrieved context. The two-plane hip movement (rear hip moving back + back-to-front weight shift) is directly lifted from the source: 'there's two planes of motion for his hips.' The kinetic chains named — obliques, serratus, front functional line through adductors, abs, and pec — match the retrieved context precisely. The catch with the lead foot is mentioned in the source ('catching his momentum with his lead foot'). The critique about the heel coming off the ground on the hook is verbatim from the source ('he's letting his heel come off the ground when he could generate more power by keeping it flat'). The note that 'the shoulder isn't driving anything' aligns with the anti-robotic-punching theme throughout the source. The drill — shadow boxing jabs focusing only on the rear hip flicking back, 50 reps — is specific, single, and actionable, consistent with Alex's methodology of isolating hip mechanics first. Voice is confident and direct with no hedging, no markdown headings, no impersonation of Alex. No myth correction rubric applies as the question was neutral. No invented fights or fabricated facts.

<details><summary>Coach response</summary>

```
Canelo's jab runs on two planes of motion simultaneously — his rear hip moves backward while his body drives from back to front. That combination rotates the torso and shifts weight into the target at the same time, which is what gives the jab its snap and bodyweight behind it.

The hip movement is what loads the cross-body chains — the obliques, serratus, and the front functional line through the adductors, abs, and pec on the opposite side. Those chains stretch as the hip flicks back, then contract to slingshot the arm forward. The shoulder isn't driving anything; it's just the last link that transfers what the hips and torso already generated.

He also catches his momentum with his lead foot after the jab lands, which lets him reset and stay ready to fire again rather than falling forward.

One critique worth noting: on his hook, he lets the heel come off the ground, which costs him some hip extension and power. Pushing off a flat foot would give him more. The jab mechanics, though, are a clean example of how the two-plane hip movement should work.

Here's what to do: shadow box jabs focusing only on the rear hip. Flick it back and let the torso follow — don't think about the arm at all. 50 reps each side, and the arm is just along for the ride.
```
</details>

### How does Artur Beterbiev generate power?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The coach's explanation is tightly grounded in the retrieved context. Hip torque creating separation between hips and torso, the spiral line and front functional line loading like a spring, the arm accelerating last, shoulder integrity minimizing energy leak, follow-through with weight transferring forward, and the arc of the arm — all appear explicitly in the retrieved context. No invented fights or fabricated facts. VOICE: Direct, confident, no hedging, no markdown headings, no apologetic phrasing, does not impersonate Alex. Clean paragraphs throughout. GROUNDEDNESS: Unmistakably Alex's framework — spiral line, front functional line, arm lines, cross-body chains, stretch-shortening cycle, sequential kinetic chain activation (hips → torso → arm), shoulder integrity as a specific structural concept. The phrase 'hips drag the arm' is a tight cue consistent with the methodology. This could not come from a generic boxing AI. ACTIONABILITY: Ends with one drill (right hand on heavy bag, 50 reps, slow), with a specific cue ('hips drag the arm'). Minor deduction because the drill lacks stance specification and the 'slow enough to feel the sequence' instruction is slightly vague compared to a fully precise drill, but it is still well above average. MYTH_CORRECTION: No explicit myth in the question, correctly scored null.

<details><summary>Coach response</summary>

```
Beterbiev generates power through hip torque — specifically the separation between his hips and his torso. His hips rotate first while his upper body stays momentarily still. That gap stretches the cross-body chains (the spiral line and front functional line) like a spring. When those chains rebound, they drive the torso into rotation, which then stretches the arm lines. The arm accelerates last, after the torso, which is what creates that whip-like cascade from the ground up to his fist.

What makes him unusual is how efficiently he does this with very little visible wind-up. The hip movement is subtle — sometimes just a couple of frames — but it's enough to load those chains and release everything in sequence. His shoulder integrity also means there's minimal energy leak at the shoulder joint; the force transfers cleanly through rather than dissipating.

The other key is **follow-through**. He doesn't tag and retract. His weight transfers forward through the target, and his arm follows an arc rather than a straight line, which keeps tension in the chains through impact instead of letting it die at the moment of contact.

Here's what to do: stand in front of a heavy bag and throw a right hand focusing only on moving your hips before your arm — hips fire, torso follows, arm comes last. 50 reps, slow enough to feel the sequence. The cue is "hips drag the arm," not "arm pushes forward."
```
</details>

### How does GGG use his power punching?
- Scores — accuracy **5** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is well-grounded in the retrieved context. Key claims check out: hip-first sequencing as initiator, pushing off flat foot for hook, torso/arm continuing through opponent after impact (the Macklin right hand frame-by-frame analysis explicitly shows this), relaxation before impact enabling deeper stretch loading, and the cross-body kinetic chain terminology all appear directly in the retrieved context. No fabricated fights or drills — the mechanics described match what the source video analyzes. VOICE: Direct, confident, no hedging, no markdown headings, no bullet lists, no apology, no first-person impersonation of Alex. Ends cleanly with one drill. Fully compliant with the product's voice design. GROUNDEDNESS: Correctly uses 'kinetic chains,' 'cross-body chains,' 'stretch-shortening' logic (loading via lag, contraction off stretch), sequential segmental activation, and weight transfer through the target — all Alex's framework. Loses one point because the response doesn't deploy the full 4-phase terminology explicitly (Load → Hip Explosion → Core Transfer → Follow Through) even though the concepts are present implicitly, and 'spiral line / front functional line' language appears to come from Thomas Myers' anatomy trains rather than Alex's specific framework terminology, which is a minor injection of outside methodology. ACTIONABILITY: Exactly one drill with rep count (50 punches), specific cue ('hips drag the arm'), and a clear behavioral instruction (shadow box, conscious hip-first sequencing). Clean and executable. MYTH_CORRECTION: No myth embedded in the question — it's a straightforward 'how does he do it' inquiry, so null is appropriate.

<details><summary>Coach response</summary>

```
Gennady Golovkin drives power through sequential kinetic chain activation — hips first, then torso, then arm. The key is that each segment lags slightly behind the one before it, creating stretch across the cross-body chains that then snaps back as a powerful contraction. That sequencing is what generates the force, not any single muscle group.

His hip rotation is the initiator. He pushes off a flat foot to drive the pelvis into rotation, and the torso lags behind just long enough to load the spiral line and front functional line — the obliques, abs, and pec all get stretched across the body. When they contract off that stretch, the arm is still behind, so it gets stretched too. By the time the fist arrives, the entire chain from foot to fist has fired in sequence.

What makes his power land so concussively is the follow-through. He doesn't tag the target and retract — he **transfers his weight through the opponent**, leaning forward with his torso continuing after impact. His weight is behind every shot, not just his arm speed.

He also stays loose until contact. That relaxation allows deeper stretching through the chains and faster arm acceleration. The tightening happens reflexively at impact, not before it.

Here's what to do: shadow box with hip-first sequencing — throw 50 punches where you consciously let the hips move before anything else, arm loose until the very end. Cue is "hips drag the arm."
```
</details>

### How does Mike Tyson generate knockout power?
- Scores — accuracy **3** · voice **5** · grounded **3** · actionable **4** · myth N/A
- Judge reasoning: The coach's response is mostly biomechanically sound and consistent with the retrieved context in broad strokes — hip rotation, torso lag, arm acceleration, follow-through, weight transfer, kinetic chain sequence. However, there are notable issues. First, the coach attributes this framework to Mike Tyson, while the retrieved context is entirely about Artur Beterbiev. The retrieved context does not discuss Tyson at all. The coach has essentially applied Beterbiev's mechanics to Tyson without grounding — this is a moderate accuracy problem since the concepts transfer generally but the specific attribution is ungrounded. Second, the coach mentions 'relaxed shoulder girdle' as key to Tyson's power, but the retrieved context explicitly states Beterbiev's power is partly attributable to TIGHT shoulder integrity and high resting muscle tension — the opposite of what the coach claims about relaxation before impact. This is a direct contradiction with the retrieved context and the most significant accuracy penalty. Third, the drill (shadow boxing with loose arms focusing on hip rotation) is reasonable but not specifically from the retrieved context, which describes a different teaching approach. The voice is excellent — direct, confident, no markdown headings, no hedging, no Alex impersonation. Groundedness is partial — cross-body chains and kinetic chain terminology appear, but the 4-phase framework is not named, and the shoulder relaxation claim contradicts the source material. Actionability is good — one drill with rounds and specific cues, though cues could be tighter.

<details><summary>Coach response</summary>

```
Tyson's power starts with his center of gravity. He keeps his hips low and flexible, which means he's essentially always in the load phase — he doesn't need a big wind-up because he's already preloaded. From that low base, he explodes his hips into rotation, and the kinetic chain does the rest: hips drive the torso, torso stretches the cross-body chains, arm lags behind just slightly and then **accelerates through the target**.

The key to his follow-through is weight transfer. His fist doesn't stop at the surface — it drives through, carrying the mass of his whole body behind it. That's why you see his upper body continuing to move forward after impact rather than pulling back.

His shoulder girdle is relaxed during the throw, which deepens the stretch in those cross-body chains before they fire. Tight shoulders kill that stretch. Tyson lets everything load and then lets it go.

The low stance also serves another purpose: his hips are flexible enough that he gets full range of motion out of the rotation, which means more torque, more stretch in the chain, more acceleration at the fist.

None of this is mysterious. It's the same hip-torso-arm sequence you see in a baseball pitch or a ball throw. The difference is Tyson does it with exceptional hip flexibility, relaxation before impact, and genuine follow-through.

Here's what to do: shadow box focusing only on hip rotation, 3 rounds, no arm — let your arms hang loose and just drive the hips. Feel the torso get dragged around by the hips before you add the punch back in.
```
</details>

### How does Floyd Mayweather Jr use defense and timing?
- Scores — accuracy **5** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: Accuracy is strong — the pull counter description (back foot in 'on your mark' position, lean forward to bait, step back onto rear leg, push off into counter) is directly corroborated by the retrieved context. The shoulder roll, distance management, micro-adjustments, and hook mechanics (flat foot, hip rotation, no pivot) all match the retrieved context precisely. The claim about reading weight distribution and throwing into gaps is consistent with Alex's concept of timing leads 'when they're not ready.' No fabricated fights or drills. Voice is clean — direct, no hedging, no markdown headings, no first-person impersonation of Alex, no video citations. One specific drill at the end with rep count and cues. Groundedness scores 4 rather than 5 because the response doesn't deploy Alex's most distinctive terminology — the 4-phase framework (Load, Hip Explosion, Core Transfer, Follow Through), kinetic chains, stretch-shortening cycle, shearing force, or cross-body chains — even though the underlying concepts are present. The hip drive and weight transfer language is there, but the framework-specific vocabulary that would make this unmistakably Alex's methodology versus a knowledgeable generic boxing answer is largely absent. The drill is well-constructed — shadowboxing with deliberate weight shifts, 50 reps, specific cue on hip drive — fully actionable. No myth was present in the user question so myth_correction is null.

<details><summary>Coach response</summary>

```
Floyd's defense is built around distance management first. He stays just outside his opponent's reach — making constant micro-adjustments so he's never quite in range — then uses a slight forward lean to give the illusion of being closer and bait punches he can slip with upper body movement alone. The shoulder roll lets him deflect incoming shots while keeping his right hand loaded to counter.

His pull counter is the sharpest expression of this. He loads weight on his back foot — essentially in a sprinter's "on your mark" position — leans forward to invite the jab, then steps back onto that rear leg and launches off it immediately, driving his hips forward into the counter. It's not just slipping and punching; the weight transfer is what powers the shot.

On timing, Floyd reads positional readiness. When an opponent's weight shifts to their front foot and they haven't converted that weight transfer into a punch, they're momentarily stuck — they'd need a tenth of a second to reload. That's when Floyd throws. He's not reacting to punches so much as reading weight distribution and throwing into the gap.

The hooks are worth noting too. He loads off a flat foot and drives his hips into rotation — no pivot. That keeps his weight low and recoverable so he can immediately reset or throw a second hook without having to replant.

Here's what to do: shadowbox with deliberate weight shifts — step forward onto your lead leg, feel your weight commit, then step back and launch a counter off the rear foot. 50 reps, focus on the hip drive as you push off, not just the footwork.
```
</details>

### How does Terence Crawford switch stances?
- Scores — accuracy **4** · voice **5** · grounded **3** · actionable **5** · myth N/A
- Judge reasoning: The response is biomechanically sound and consistent with the retrieved context's emphasis on rear leg loading, weight positioning, and the principle that the loaded back leg enables explosive push-off. The retrieved context confirms Crawford's mechanics involve weight on the back foot ready to push forward to launch offense, and the general stretch-shortening cycle principle supports the 'drops center of gravity to pre-load tissues' claim. However, the response doesn't use Alex's specific terminology (stretch-shortening cycle, kinetic chains, 4 phases, cross-body chains) — it explains the mechanics correctly but in generic biomechanical language rather than Alex's framework. The 'land loaded' cue and drill are specific and actionable with clear reps and focus. Voice is clean — direct, no hedging, no markdown, no first-person impersonation of Alex. The accuracy penalty is minor: the response is grounded in correct principles but makes the stance switch sound more mechanistically detailed than the retrieved context supports specifically for Crawford's switching — the context discusses his balance and readiness but doesn't explicitly detail the switching mechanism itself, meaning some claims (e.g., 'drops center of gravity slightly') are reasonable inferences rather than directly retrieved facts.

<details><summary>Coach response</summary>

```
Crawford uses stance switches as a loading mechanism, not just a positional change. When he switches, he's repositioning his weight so the opposite leg becomes the rear leg — and that rear leg is now loaded and ready to push off. It's the same principle as any other punch: you need a loaded back leg to explode from.

The switch itself drops his center of gravity slightly, which pre-loads his tissues. The moment his weight settles into the new stance, he can immediately fire off the opposite hand. He doesn't pause in the new stance — the switch and the punch are essentially one continuous movement.

What makes it effective is that the opponent has to track a new threat angle while Crawford is already mid-load. By the time the stance change registers, the punch is already on its way.

Here's what to do: shadow box and switch stances every 3–4 punches, 3-minute rounds, focusing on landing your weight on the rear foot of the new stance so you can immediately push off it. The cue is "land loaded."
```
</details>

### How does Gervonta Davis generate knockout power?
- Scores — accuracy **4** · voice **5** · grounded **5** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is largely consistent with the retrieved context — hip explosion, hip-torso separation, cross-body chains (spiral line and front functional line), the kinetic cascade, loose-arm-then-clench, and weight transfer through the target are all present in the source material. The specific claim about Davis 'grabbing the fist at contact' (loose until last moment then violent clench) is not explicitly stated in the retrieved context, which discusses follow-through and weight transfer but not the clench mechanic specifically — this is a minor ungrounded addition. The 'hips, torso, arm' sequence is directly grounded. The fight referenced (Macklin) appears in retrieved context. No invented fights are cited. VOICE: Direct, confident, no hedging, plain paragraphs, no markdown headings, no first-person Alex impersonation. Clean product-compliant voice throughout. GROUNDEDNESS: Strongly rooted in Alex's specific framework — kinetic cascade, stretch-shortening cycle, cross-body chains, spiral line, front functional line, the four-phase logic (load, hip explosion, torso, arm, follow-through), hip-torso separation. Terminology is unmistakably Alex's methodology, not generic boxing advice. ACTIONABILITY: Ends with exactly one specific drill (hip isolation drill, feet planted, hands on hips, rear hip rotation keeping shoulders still, 50 reps) with clear cues. User knows exactly what to do. MYTH_CORRECTION: No myth was present in the user's question — they asked a neutral mechanics question — so null is appropriate.

<details><summary>Coach response</summary>

```
Gervonta Davis generates power the same way every elite puncher does — through the kinetic cascade — but he does it with exceptional hip explosion and a deep stretch of his cross-body chains.

The sequence starts with his hips. He drives off his back foot to push the rear hip forward, rotating the hips independently from the torso. That hip-torso separation is the key: the torso stays relatively still for a split second while the hips are already moving, which stretches the spiral line and front functional line across the body. That quick stretch loads elastic energy into those chains, and they snap back in a violent contraction that spins the torso. The arm lags behind the torso, adding another stretch between the chest and the arm, and then the arm accelerates through to impact — **hips, torso, arm, in sequence**, each link faster than the last.

What makes Davis stand out is how much range he creates in that hip opening. On his uppercuts especially, you can see the hips open dramatically before the arm even starts moving. That wider hip rotation means more stretch, which means a more violent elastic rebound, which means more speed at the fist. He also keeps his arm loose until impact and then grabs the fist at contact — loose until the last moment, then a violent clench, which maximizes both speed and concussive force.

He also follows through past center, transferring his weight into and through the target rather than stopping at the surface. That weight transfer is what turns a fast punch into a finishing blow.

Here's what to do: hip isolation drill — feet planted, hands on hips, rotate the rear hip forward while keeping your shoulders still, 50 reps. Feel the torso lag behind. That hip-torso separation is the entire foundation of the cascade.
```
</details>

### How does Naoya Inoue generate knockout power?
- Scores — accuracy **5** · voice **4** · grounded **5** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is well-grounded in the retrieved context. Key claims — hip drop to load, hips exploding first, torso following, arm lagging then firing, Inoue not drawing the fist back, relaxation enabling the chain — all appear explicitly in the retrieved context (e.g., 'he does not bring his fist back at all. He starts just moving with his pelvis... creating that torque' and the four phases Load/Explode/Accelerate/Follow Through). The mention of Jason Maloney is implicitly supported by the source mentioning that fight. The cross-body chains and spiral line terminology matches Alex's framework exactly. No fabricated fights or drills detected. VOICE: Mostly direct and confident with plain paragraphs, no markdown headings, no impersonation of Alex. The use of bold formatting on 'loose until the moment of impact' is a minor markdown intrusion that slightly breaks the plain-paragraph format requirement, hence a 4 rather than 5. No hedging or chatbot politeness. GROUNDEDNESS: Strongly rooted in Alex's specific framework — kinetic cascade, stretch-shortening cycles, cross-body chains (spiral line, front functional line), the four phases, and the specific Inoue mechanic of hip-initiated compact punching. The terminology is unmistakably Alex's, not generic boxing coaching. ACTIONABILITY: Ends with exactly one drill — short rear hand at bag, hip-initiated, no arm windup, 3 sets of 20, with a clear cue ('hips go first, hand follows'). Precise and executable. MYTH_CORRECTION: No myth was embedded in the user's question, so null is appropriate.

<details><summary>Coach response</summary>

```
Inoue's power comes from the same kinetic cascade every elite puncher uses, but what stands out is how efficiently he executes it from a very short distance.

It starts with the hips. He drops his center of gravity slightly to load elastic muscle energy, then explodes the hips into rotation. That rotation stretches the cross-body chains — the spiral line through the obliques and serratus, and the front functional line through the abs and pec — before the torso has even moved. Those chains snap back, which then stretches the arm line, which fires in turn. Hip, torso, arm — a cascade of stretch-shortening cycles accelerating through him in sequence.

What makes Inoue look different is that he barely draws the fist back at all. Almost all the movement is forward, driven entirely from the pelvis. Most fighters telegraph by pulling the hand back first. He doesn't. The load is in the hip drop, not the arm.

He also stays **loose until the moment of impact**, which is essential. A tense shoulder can't drop and create that last bit of stretch before the arm fires. Relaxation is what makes the chain work.

The result is full-body weight transfer through a very compact motion — which is what makes it feel so concussive at close range.

Here's what to do: stand at the bag, drop your center of gravity slightly, and throw a short rear hand initiating only with the hip — no arm windup. 3 sets of 20, cue is "hips go first, hand follows."
```
</details>

### How to throw a proper jab?
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **5** · myth 5
- Judge reasoning: ACCURACY: The response is largely consistent with retrieved context. The hip flick mechanics, cross-body chain loading, arc maintenance, weight transfer to lead leg, and Tommy Hearns reference all appear in the retrieved context. One minor issue: the response says 'kick off the back foot from the bottom-outside edge' — the retrieved context says 'bottom and front-outside edge,' a small but real discrepancy. The response also mentions 'rear hip flicking backwards' which aligns with context. The 50 slow reps drill is plausible but not explicitly in retrieved context, though it's a reasonable instructional drill. No fabricated fights or events. VOICE: Excellent — direct, confident, no hedging, no markdown headings, no apology, no first-person impersonation of Alex. Reads like a coach, not a chatbot. GROUNDEDNESS: Strong use of Alex's framework — cross-body chains, spiral line, front functional line, arm lines, stretch-shortening rebound, the arc maintaining tension, hip flick as power source, lead leg catch and reset. Tommy Hearns named appropriately as in retrieved context. Minor deduction: 'spiral line' and 'front functional line' are named but 'lateral line and quads as the jab engine' — a key Alex-specific concept from the retrieval — is omitted entirely. Also missing the basketball jab-step analogy and the 4-phase structure language. ACTIONABILITY: Ends with exactly one drill with clear reps (50), cues (feel hip before arm), and stance context. Clean. MYTH_CORRECTION: Immediately and correctly identifies the elbow-extension arm punch myth and reframes with the hip-driven integrated body mechanic — matches the retrieved context's framing precisely.

<details><summary>Coach response</summary>

```
The jab is powered by a hip flick, not an elbow extension. Most people throw it by straightening the arm — that's an arm punch, and it's weak.

Here's the sequence. Start with your weight around 50/50. Dip slightly to load the rear leg — simultaneously lift your lead leg and let the lead arm relax briefly. That relaxation stretches the cross-body chains so the punch can actually launch. Then kick off the back foot from the bottom-outside edge, flicking the rear hip backwards. That hip flick stretches the spiral line and front functional line, which rebound elastically and slingshot the arm forward. The arm doesn't push out — it gets thrown forward by the body's rotation.

Keep the arm moving on a slight arc the whole way. The arc maintains tension between your fist and your body. If you punch in a straight line, you lose that connection and leak power.

At impact, **grab your fist hard**, drive through the target, and let the lead leg catch your bodyweight. Then push back off that lead leg to reset. The step forward isn't optional — it's how you use gravity, close distance, and stay out of range after the punch lands.

The rotation doesn't need to be huge. Subtle hip movement is enough to load the chains and launch the arm. Tommy Hearns used big rotation on his jab, which is the extreme version. Most fighters use a smaller flick and still get serious pop from it.

Here's what to do: stand in your stance, dip to load the rear leg, lift the lead foot, then kick off the back foot and let the hip flick drive the arm out — 50 slow reps, focusing on feeling the hip move before the arm does.
```
</details>

### How to throw a proper hook?
- Scores — accuracy **3** · voice **5** · grounded **3** · actionable **4** · myth N/A
- Judge reasoning: The response gets the flat-foot drive and glute-driven hip rotation correct, consistent with the retrieved context. However, there are notable accuracy and groundedness issues. The most significant problem: the retrieved context's central teaching is about wrist/palm orientation — landing with palm facing you to utilize three kinetic chains (front superficial arm line into pec major/lats, front functional line, back functional line). The coach response completely omits this, which is the core of what was retrieved. Instead, the response invents 'flex the bicep to tighten the arc's radius — shorter radius means faster fist at impact,' which has no grounding in the retrieved context and contradicts the spirit of the kinetic chain explanation (the bicep is not the mechanism). The 'grab your fist at impact' cue is present in the retrieved context and is correctly included. The mention of 'lateral line' and 'spiral line' uses terminology not clearly present in the retrieved context (Alex uses specific named chains like front superficial arm line, front functional line, back functional line, deep front arm line). The drill — shadow hook with loose arm 50 reps — is reasonable and specific with reps and cues, earning a 4 rather than 5 because it's not explicitly drawn from the retrieved context. Voice is strong throughout: direct, no hedging, no markdown headings, no impersonation of Alex. No myth was presented in the question so myth_correction is null.

<details><summary>Coach response</summary>

```
The hook starts with the lead leg. Shift your weight onto it with a slight knee and hip bend — that loads the lateral line and primes the glute to fire. Drive off a flat foot, not a pivot. The glute extends and rotates the hip simultaneously, and that rotation is what starts the whole chain.

As the hips open, the cross-body chains — spiral line and front functional line — get stretched. The arm lags back, the shoulder blade fully retracts, and the elbow opens slightly. That lag is not a mistake; it's loading the pec and arm line for the snap.

When the torso reaches the end of its rotation, the pec hits max stretch and rebounds. The arm accelerates across the body. At that point, **flex the bicep to tighten the arc's radius** — shorter radius means faster fist at impact. Land mid-arc to create shearing force, not a flat perpendicular smack.

Impact happens as your weight crosses the center line. Grab your fist at that moment. Then counter-rotate your hips — belt buckle stays forward — to stop the over-rotation and pre-load the rear hand if you want to follow up.

No shoulder push. The shoulder retracts and then protracts as the final link in the chain. It transfers power; it doesn't generate it. Pushing it early breaks the sequence.

Here's what to do: shadow hook with a completely loose arm, 50 reps each side. Drive the hips and let the arm drag behind — feel the stretch build before the arm comes. Only worry about fist speed once you can feel that lag and snap.
```
</details>

### How to throw a proper uppercut?
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is largely accurate and consistent with the retrieved context. The lead/rear uppercut loading phases, elbow positioning, hip opening/closing, and throw-not-push concepts all match the retrieved material precisely. The 'arm up, shoulder down' cue and 'grab the fist' at impact are directionally consistent with Alex's framework. However, the Earnie Shavers reference is a specific claim not present in the retrieved context — the context mentions Gervonta Davis explicitly, not Shavers. Inventing a specific fighter example not grounded in retrieved context is a minor accuracy concern, though it's not a fabricated fight result, just a fighter name used as example. This keeps it from a 5. VOICE: Excellent — direct, no hedging, no markdown headings, plain paragraphs, does not impersonate Alex, no 'my framework' or 'my video' language. Confident throughout. GROUNDEDNESS: Strong use of Alex's methodology — kinetic chain sequencing, cross-body chains, ground reaction force driving upward, stretch-shortening cycle, throw-not-push ('it becomes a weak, slow arm punch'), shoulder-as-transfer-not-generator. Missing some signature terminology like 'kinetic cascade' or explicit 4-phase labeling, but the concepts are clearly present. ACTIONABILITY: Ends with exactly one drill — shadow boxing lead uppercuts with hand on hip to feel rotation, 3 sets of 20 reps, with a clear cue. Specific and executable. MYTH_CORRECTION: No clear myth in the question, so null is appropriate.

<details><summary>Coach response</summary>

```
The uppercut is powered by the legs and hips, not by scooping with the arm. That's the core thing to get right.

For the lead uppercut, your weight loads onto the lead leg and your hips open — same setup as a hook. The only difference is the arc goes vertical instead of horizontal. For the rear uppercut, weight loads onto the rear leg and the hips close — same pattern as the straight. Because of this, the lead uppercut and hook flow naturally from the same position, and so do the rear uppercut and cross.

From that loaded position, you sink slightly to create upward trajectory, then drive off the ground, open or close the hips depending on which hand you're throwing, and let that rotation pull the torso around. The arm follows as the last link. Keep the elbow close to the body throughout — if it wings out, you lose the vertical channel and the punch turns into a wild scoop.

The shoulder does not lift the fist. The body drives upward and the arm rides that energy. Think arm up, shoulder down. As soon as people try to press the fist upward with the shoulder, they disconnect from the kinetic chain and it becomes a weak, slow arm punch.

Stay loose all the way through, then **grab the fist** at the moment of impact. That's what converts the rotational energy into concussive force.

Earnie Shavers is a great example to study — his hips would rotate forward as the arm came back, maximizing the stretch in the cross-body chains before everything contracted and the fist accelerated upward.

Here's what to do: shadow box lead uppercuts focusing only on hip opening. Keep one hand on your hip and feel it rotate forward as you throw. 3 sets of 20 reps. If the hip isn't driving it, you're just lifting your arm.
```
</details>

### How to throw a proper straight or cross?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **4** · myth N/A
- Judge reasoning: Accuracy: The response is tightly consistent with the retrieved context. The straight-to-cross spectrum (lateral torso bend), the 'on your mark' loading position, the hip-closing-as-push mechanic (skateboard analogy), the hip-torso-arm sequencing with deliberate lag, the pec/serratus anterior connection, the elliptical return path, weight transfer to lead leg, pronation at impact — all appear in the retrieved context. No invented fights or drills contradict the source material. Voice: Direct, confident, no hedging, no markdown headings, no bullet lists, no AI politeness filler. Does not impersonate Alex — written as a neutral coach explaining the methodology. Groundedness: Strongly rooted in Alex's specific framework. Uses his exact terminology: cross-body chains, spiral line, front functional line, stretch-shortening cycle, elastic rebound, four-phase structure (load/explode/accelerate implied), hip-closing vs. pivot distinction. The skateboard push analogy is directly from the retrieved context. The serratus anterior connection is named specifically. This response could not come from a generic boxing AI. Actionability: Ends with one specific drill (shadow box with exaggerated hip-lead, 3 sets of 20 reps) with a specific cue (let the arm lag until the torso has already started rotating) and a correction instruction (if arm leaves with hips, start over). Solid. Minor deduction because '3 sets of 20 reps' for shadow boxing is somewhat arbitrary and the cue, while good, could be slightly more precise about what 'already started rotating' means physically. Myth correction: No myth was embedded in the user question — it was a straight how-to request — so null is appropriate.

<details><summary>Coach response</summary>

```
The straight and the cross are the same rear-hand punch at their core — the cross just adds lateral torso bend, which moves your head off the centerline and puts your fist on the outside of the opponent's jab. More side bend means more downward angle at impact and more pre-stretch in the cross-body chains.

Start in what you'd call an "on your mark" position — weight loaded into the rear leg, rear hip pulled back, cross-body chains already coiled. That pre-stretch is your stored elastic energy before anything fires.

Phase one is that load. Phase two is where the power lives: **drive the rear hip forward to close it**, like you're pushing a skateboard with your back foot. That's not a pivot — it's a push. The hip closes aggressively, which stretches the spiral line and front functional line diagonally across your torso. The torso lags behind the hips for a moment. That lag is the stretch.

The torso then snaps through, which stretches the arm line — the pec and serratus anterior pull the shoulder forward and extend your reach — and the arm accelerates last. Each link moves faster than the one before it. Hips, torso, arm. Never all at once.

At impact, grab the fist as hard as you can, pronate the forearm, and transfer your weight forward onto the lead leg. The punch lands with a slight downward arc, not a flat push. After contact, the arm's return path traces almost an ellipse — it doesn't come back the same way it went out.

Here's what to do: shadow box with exaggerated hip-lead, 3 sets of 20 reps, and consciously let the arm lag until the torso has already started rotating. If the arm leaves at the same time as the hips, start over.
```
</details>

### Explain kinetic chains in punching
- Scores — accuracy **4** · voice **5** · grounded **5** · actionable **5** · myth N/A
- Judge reasoning: Accuracy is 4 rather than 5 because the response contains one minor omission/imprecision: the retrieved context specifically names the Back Functional Line (lats to opposite glute) as a critical cross-body chain, but the coach response omits it entirely, only naming the spiral line and front functional line. The retrieved context also details the Superficial Back Line, Lateral Line, and Superficial Front Line in the loading phases — none of which appear in the response. These aren't fabrications, just gaps. The spaghetti arms drill is directly grounded in the retrieved context (named explicitly with the same cues: shrug shoulders, drop them, initiate with hips, arms lagging like elastic ropes). The whip analogy, stretch-shortening cascade, hip-torso-arm sequencing, arc vs straight line, shoulder-as-transfer-not-generator, and cross-body chain mechanics all map precisely to the retrieved context. Voice is clean — no markdown headings used in the actual response body (the bold on 'maintaining tension' is a minor formatting element, not a structural heading), direct and confident, no hedging, no impersonation of Alex. Groundedness is strong — kinetic chains, stretch-shortening cycle, cross-body chains, spiral line, front functional line, arc trajectory, kinetic tether concept, and the specific anti-shoulder-power point are all Alex's specific framework terminology pulled directly from retrieval. Actionability is strong — exactly one drill with sets, reps, and specific movement cues.

<details><summary>Coach response</summary>

```
A kinetic chain is a chain of muscles connected by fascia running through the body. You don't have one — you have many, and they all work together to generate and deliver a punch.

The sequence runs from the ground up. Your legs load and push the hips into rotation. That rotation stretches the cross-body chains — the spiral line (internal and external obliques connecting through the serratus anterior into the shoulder blade) and the front functional line (abs and pec, with the pec crossing the shoulder joint). Those stretched muscles snap back in a powerful contraction, which then stretches the arm lines and accelerates the fist through impact.

Each link in that sequence moves faster than the one before it. The hips move first, the torso lags slightly behind and then passes the hips, the arm lags behind the torso and then passes it. That compounding acceleration — hip to torso to arm to fist — is what generates real power. Like a whip. Every link adds its own stretch-shortening cycle on top of the last.

The key to keeping this working is **maintaining tension in the system throughout**. Your fascia tethers your fist to your rotating body. An arc trajectory keeps that tension intact. A straight-line push doesn't — it bypasses the lats and the cross-body chains and leaves you using just the smaller pecs and deltoids.

The shoulder doesn't generate anything here. It transfers energy from the torso into the arm. That's it.

Here's what to do: spaghetti arms drill, 3 sets of 30 reps each side — shrug your shoulders up, drop them, and rotate side to side initiating with the hips while keeping your arms completely loose. Let the arms lag behind the hips like they're on elastic ropes. You're training the hip-to-arm sequence, not muscling the arm.
```
</details>

### Explain the 4 phases of power in punching
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **4** · myth N/A
- Judge reasoning: The response maps cleanly onto the retrieved context across all four phases. Phase 1 (load/dip) matches the elastic potential energy loading described in both PPB and PPB 2.0 sources. Phase 2 (hip explosion) correctly identifies hip drive vs. pivot, matches Alex's 'driving hips not pivoting' language. Phase 3 (acceleration/cascade) correctly describes the stretch-shortening cycle cascade and explicitly names the lat contribution via arc trajectory — both are in the retrieved context from pages 17-20. The 'grab the fist' at impact matches the 'squeeze the fist suddenly' instruction in the loose-until-impact section. Phase 4 follow-through and 'final position is starting position of next punch' matches the KIMs principle verbatim from the PPB 2.0 source. Opening vs. closing hip rotation for different punches is methodologically consistent though not explicitly in the retrieved chunks — this is a minor extrapolation but not contradicted. Voice is direct, no hedging, no markdown headings, no first-person impersonation of Alex. Groundedness is high — stretch-shortening cycle, cross-body chains, cascade, loose-until-impact, arc-not-straight-line are all Alex's specific framework terminology. Actionability docks one point: the drill given (hip opening/closing, 100 reps each stance daily) is specific and has reps and cues, which is good, but it diverges from the retrieved context's recommended drills (the High Five exercise, the bounce drill) and the specific drill is not explicitly sourced in retrieval — it's a reasonable extrapolation but not directly grounded. No myth correction scenario present in the question.

<details><summary>Coach response</summary>

```
Every punch follows the same sequence: load, explode, accelerate, follow through. Impact happens right between acceleration and follow through.

Phase one is the load. You're stretching your leg muscles and the cross-body chains so they can snap back harder. Think of dipping before you jump — that quick bend loads elastic energy so the muscles can contract more explosively. Your stance keeps you partially loaded already, but a small dip adds more. The key is it has to be fast, not a big telegraphed wind-up.

Phase two is the explosion. Your hips drive into rotation — either opening or closing depending on the punch. Opening powers the jab, hook, and lead uppercut. Closing powers the cross and rear uppercut. This is hip drive, not a foot pivot. Push off a flat foot and let the hips lead everything else.

Phase three is acceleration. The hips turn first, the torso lags behind and then snaps forward, the arm lags behind that and then fires through. It's a cascade — each link in the chain accelerates off the one before it. Stay completely loose here. Tension kills speed. The arm travels in an arc, not a straight line, which is what lets the lats contribute instead of just the smaller shoulder muscles.

Just before impact you **grab the fist** — a violent squeeze that firms everything up and turns your forearm into a club. Then you drive your weight through the target, not just to it.

Phase four is follow through. You unwind through impact, transfer your weight, and the reset either brings you back to neutral or loads the next punch. The final position of one punch is the starting position of the next.

Here's what to do: hip opening and closing drill, 100 reps each stance, daily. Dip, drive the hips open or closed all the way, feel the glute doing the work. No arm involved yet — just learn the engine.
```
</details>

### What is shearing force in punching?
- Scores — accuracy **4** · voice **5** · grounded **3** · actionable **5** · myth N/A
- Judge reasoning: The coach's explanation of shearing force is biomechanically coherent and directionally correct — the concept of forward-and-down trajectory, axial vs. shearing force, and last-three-knuckles structural alignment are all consistent with Alex's framework. However, the retrieved context is entirely about the stretch-shortening cycle and contains no mention of shearing force, axial force, or knuckle landing mechanics. This means the coach's response cannot be fully verified against the retrieved ground truth — it's likely drawing from other parts of Alex's knowledge base that simply weren't retrieved here, rather than being fabricated. The wall drill at the end is specific, has clear reps and cues, and ends cleanly on exactly one action — that's a strong 5 for actionability. Voice is excellent: direct, no hedging, no markdown headings, no impersonation of Alex, confident corrections without apology. Groundedness scores only a 3 because the response doesn't deploy Alex's core terminology from the retrieved context (stretch-shortening cycle, kinetic chains, 4 phases, cross-body chains) — it stays on shearing force mechanics without connecting to the broader framework that distinguishes this methodology. A stronger response would have tied shearing force into the arc trajectory that emerges from the cascade of stretch-shortening cycles, which is exactly what the retrieved context describes. No myth to correct in the original question.

<details><summary>Coach response</summary>

```
When you land a punch, the fist travels forward and slightly downward at impact — not straight into the target. That downward angle means the force slides across the surface rather than driving straight through it. That's shearing force.

The alternative is axial force — pushing directly into the target along the same axis you're punching. That compresses the wrist, loads the joints badly, and is how people break their hands.

**Shearing force distributes the impact across a broader area of the fist and wrist**, which is both safer and more damaging to the target. It also connects naturally to landing on the last three knuckles — the middle, ring, and pinky — which run through the ulna and directly into the humerus. That's your structural power line. The first two knuckles don't have that direct connection, so landing on them under axial load is asking for injury.

The forward-and-down trajectory isn't something you manufacture consciously. It comes from throwing the punch through an arc rather than pushing it in a straight line. Get the arc right and the shearing angle shows up naturally.

Here's what to do: lean against a wall with your last three knuckles, then your first two. Feel the difference in stability. Do that ten times each side until the structural difference is obvious, then carry that alignment into your shadow boxing.
```
</details>

### What is the stretch-shortening cycle in punching?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The response is tightly consistent with the retrieved context. The cascade description (hips → cross-body chains → arm line), the elastic rebound mechanism, the 'quick stretch loads the spring' framing, the 'feels like a throw not a muscular effort' line, and the sequencing signature all appear verbatim or near-verbatim in the ground truth. No invented fights, drills, or facts. VOICE: Direct, confident, no hedging, no markdown headings, no apology, no first-person impersonation of Alex. The bold on 'it feels like a throw' is a minor formatting flourish but not a heading — acceptable. GROUNDEDNESS: Unmistakably Alex's framework. Uses his specific terminology: stretch-shortening cycle, cross-body chains, obliques/pec/serratus/abs, cascade, sequencing (hips → torso → arm), elastic rebound, 'throw not effort.' The 'you don't crunch your abs or consciously fire your obliques' point directly mirrors the retrieved context's explicit clarification that cross-body contraction is NOT a conscious effort. This could not come from a generic boxing AI. MYTH_CORRECTION: No myth was present in the question — user asked a neutral 'what is' question, so null is appropriate. ACTIONABILITY: The broomstick drill is specific and grounded (100 reps, glutes holding hips forward while torso turns, last-second hip drive to feel the snap). Loses one point because while it has reps and a cue, the broomstick drill does not appear in the retrieved context — it may be from Alex's methodology elsewhere but is not verifiable from the provided retrieval. It's a plausible Alex-style drill but technically ungrounded in the provided chunks, which is a minor accuracy/actionability concern. Kept at 4 rather than penalizing accuracy because the drill concept is consistent with the framework even if not confirmed in this retrieval.

<details><summary>Coach response</summary>

```
The stretch-shortening cycle is the engine behind every powerful punch. A quick stretch loads elastic energy into a muscle like a spring, and then that energy releases with a faster, more violent contraction than the muscle could produce on its own. The key word is quick — the speed of the stretch is what loads the spring. A slow stretch doesn't do it.

In a punch, this doesn't happen once. It cascades. The hips rotate first, which stretches the cross-body chains — the obliques, abs, pec, and serratus. Those snap back elastically, which stretches the arm line, which then fires in turn. Each link in the chain is powered by the one before it, and each one moves faster than the last. That's why the fist is the fastest thing moving at impact even though it started from a standstill.

The cross-body "contraction" is not something you do on purpose. You don't crunch your abs or consciously fire your obliques. The hip rotation does the stretching, and the rebound happens automatically. When you get the timing right, **it feels like a throw**, not a muscular effort.

The signature of the whole thing is sequencing: hips first, then torso, then arm. If everything moves at once, there's no lag, no stretch, no elastic rebound — you're just pushing.

Here's what to do: broomstick rotation drill, 100 reps. Stick on your shoulders, rotate side to side, but use your glutes to keep your hips pointing forward while your torso turns. At the end of each turn, drive the hips in the opposite direction at the last second and feel the snap in the cross-body chains. That's the mechanism you're building.
```
</details>

### What is the difference between throwing and pushing a punch?
- Scores — accuracy **5** · voice **4** · grounded **4** · actionable **4** · myth 5
- Judge reasoning: ACCURACY: The coach's core claims are well-grounded in the retrieved context. The bench press analogy (push = pecs/delts/triceps, not rotational), the whip/cascade metaphor, the arc vs. straight-line distinction, and the hip-first sequencing all appear explicitly in the retrieved context ('You should think about the punch like a swing or a throw, not a bench press,' 'arc requires tension,' 'hips moving first, then the torso, and then the arm finishes'). No fabricated fights or events. VOICE: Mostly direct and confident with plain paragraphs. No markdown headings in the body. However, the response uses a bold line ('**The punch is a throw**') which introduces markdown formatting — minor violation. No impersonation of Alex. No hedging. GROUNDEDNESS: The response uses several of Alex's specific concepts: rotational mechanics, kinetic cascade/chains, the arc trajectory, hip-first sequencing, and the whip analogy (consistent with kinetic tethering). However, it does not deploy his specific 4-phase terminology (Load→Explode→Accelerate→Follow Through), does not mention the stretch-shortening cycle by name, and does not reference cross-body chains or the latissimus dorsi arc advantage — all of which appear prominently in the retrieved context and would have strengthened methodological specificity. ACTIONABILITY: Ends with exactly one drill (medicine ball or tennis ball, push vs. rotational throw, 20 reps each side) with clear cues. The drill is practical and illustrative. However, it is not explicitly from the retrieved context (the High Five drill is the canonical drill from the source material for this concept), so it reads as reasonable but slightly improvised. MYTH_CORRECTION: Excellent — the push/throw distinction is the central myth being corrected, and the coach addresses it directly and immediately with the underlying mechanic, consistent with Alex's framework.

<details><summary>Coach response</summary>

```
A push moves in a straight line. It's essentially a bench press — you're extending the arm forward using the pecs, delts, and triceps as the primary movers. There's no rotational component, no kinetic cascade, no elastic loading. The shoulder leads, the arm extends, and the power caps out at whatever those smaller muscles can produce.

A throw is rotational. The hips fire first, stretching the cross-body chains connecting hip to opposite shoulder. Those chains snap back and drive the torso into rotation, which stretches the arm lines, which then accelerate the fist through impact. Every link in that chain accelerates the next one, compounding speed the way a whip does. The shoulder doesn't generate anything — it just transfers what the hips and core already built.

The practical difference is easy to see with a ball. Push it with linear punch mechanics and it barely moves. Throw it with the same arm using a tightening arc and it leaves your hand with dramatically more speed. Tighten that arc almost to a straight line and it still outperforms the push by a wide margin. That's what's happening inside every powerful punch — the arc is just tight enough that it looks linear from the outside.

**The punch is a throw** — hips load, hips explode, chains transfer, fist arrives. The arm is the last link, not the driver.

Here's what to do: grab a light medicine ball or even a tennis ball, throw it against a wall with a pushing motion, then throw it like you're skipping a stone — same arm, rotational hip drive, arc. Feel the difference in 20 reps each side.
```
</details>

### How do I do the hip opening drill?
- Scores — accuracy **4** · voice **4** · grounded **3** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The core mechanics are well-grounded in the retrieved context — back foot as pivot engine, 100 reps/day both stances, opening vs closing hips, upper body relaxed. However, the coach describes opening as 'lead hip pulls back, belt buckle turns ~90 degrees' and closing as 'rear hip drives forward, belt buckle pointing forward,' which aligns with the source. Minor issue: the coach says 'pivot on your back foot and push off it to rotate your hips open' but the retrieved context specifies 'backward pivot = opening hips' and 'forward pivot = closing hips' — the coach reverses the sequence slightly, describing opening first via back foot pivot, which is consistent enough. The 'athletic center two inches below belly button' cue is not present in the retrieved context and reads as a generic coaching add-on, which docks a point. VOICE: Direct, confident, plain paragraphs, no markdown headings, no hedging, no first-person impersonation of Alex. Slight drift into the 'Lead with your athletic center' cue that feels generic, but overall voice is clean and authoritative. GROUNDEDNESS: Uses Alex's framework concepts (back foot as engine, hip opening/closing, relaxed upper body, cross-body chain implications), but does NOT deploy his specific terminology — no mention of kinetic chains, stretch-shortening cycle, cross-body chains, or the 4-phase framework. The 'two inches below belly button' cue is not Alex's language. The response could plausibly come from a solid generic boxing coach, which limits the score. ACTIONABILITY: Ends with exactly one drill — 100 reps/day, both stances, back foot pivot every rep, with a one-week timeline. Clear and actionable. MYTH_CORRECTION: No myth in the user's question — they simply asked how to perform the drill.

<details><summary>Coach response</summary>

```
Stand in your fighting stance. Pivot on your back foot and push off it to rotate your hips open — that means your lead hip pulls back, your belt buckle turns roughly 90 degrees to the side. Then push off your lead foot and drive your rear hip forward to close them all the way, belt buckle pointing forward. Open, close, open, close. Keep your upper body loose the whole time — let the torso follow the hips, don't muscle it with your shoulders.

The lead foot stays more or less pointed forward. Don't pivot on it. The back foot is the engine.

**Lead with your athletic center** — about two inches below your belly button. That's what initiates the rotation, not your shoulders or arms.

Here's what to do: hip opening and closing drill, 100 reps per day in both orthodox and southpaw stance, back foot as the pivot point every rep. Within a week you'll start feeling the difference in where your power is coming from.
```
</details>

### What bag work routine should I use?
- Scores — accuracy **4** · voice **4** · grounded **3** · actionable **3** · myth N/A
- Judge reasoning: ACCURACY: The response is largely accurate and consistent with retrieved context. The weight control exercise description matches well — pushing fist into bag with full body weight, feeling weight transfer, catching the returning bag. The combination system (1-2, 1-2-3, 1-2-3-2-1) and the hip open/close chain logic all align with retrieved context. Minor issue: the response recommends a 'medium-weight water bag' and mentions brands implicitly, but the retrieved context specifies 16oz well-padded gloves and recommends Powair/Title water bags — the coach doesn't mention glove weight at all, and says 'medium-weight' which isn't in the source. Also the '100 reps per punch' prescription at the end has no grounding in the retrieved context, which is a minor fabrication of specifics. VOICE: Mostly direct and confident, no hedging, no markdown headings, no first-person Alex impersonation. Uses plain paragraphs. Slight drift toward generic coaching tone in places. GROUNDEDNESS: Uses the hip open/close chain logic and the weight control exercise from Alex's methodology, which is good. However, the response does NOT use Alex's specific 4-phase terminology (Load, Explode, Accelerate, Follow Through), doesn't mention kinetic chains, stretch-shortening cycle, or cross-body chains — all of which are present in the retrieved context. Feels like it could come from a reasonably informed generic boxing coach. ACTIONABILITY: The response ends with a drill (single-punch rounds, 100 reps per punch) but the '100 reps' figure is invented — not in the retrieved context. Also the response lists multiple drills/rounds throughout rather than closing with exactly ONE specific drill. The final call-to-action is present but not cleanly isolated as the single closing drill. MYTH_CORRECTION: No myth was present in the user's question.

<details><summary>Coach response</summary>

```
The bag is where you wire the mechanics into muscle memory, so structure the work around one principle: each punch's follow-through loads the next. Don't think of combinations as separate shots strung together — think of them as one continuous chain of hip rotations, alternating open and close.

Start with single punches. Jab for a round, straight for a round, hook for a round. Slow enough that you can feel the hip drive preceding the arm on every rep. If the hip isn't leading, you're just arm-punching.

Then build into combinations. Jab-straight. Jab-straight-hook. Eventually the full 1-2-3-2-1, which cycles through a complete open-close-open-close-open sequence. Let the hips flow from one to the next rather than resetting between punches.

One practical tip: use a medium-weight water bag if you can. It gives you honest feedback on weight transfer — you can actually feel whether your body mass is going into it or just your arm.

Also worth a round: the weight control exercise. Press your fist into the bag with your **full body weight** leaning into it. Hold it. Feel what total weight transfer actually is. Then let the bag swing back and catch it. That sensation is what you're chasing in every real punch.

Here's what to do: single-punch rounds first, 100 reps per punch, lead and rear side both, hips initiating every rep before the arm moves an inch.
```
</details>

### Compare Canelo's jab to GGG's power punch
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is largely grounded in the retrieved context — GGG's flat-foot mechanics, hip-first sequencing, torso follow-through, and cross-body chain loading all appear explicitly in the retrieval. The claim about Canelo's heel coming up and knee tracking in on his hook is not supported by the retrieved context (the retrieval covers Canelo's jab mechanics but doesn't mention heel-rise or knee-in as criticisms). This is a mild fabrication or importation from outside the retrieved context, dropping it from a 5. The fight reference (GGG vs Macklin) is grounded. The characterization of Canelo's technique as 'more muscling, less effortless chain utilization' goes slightly beyond what the retrieval supports — the retrieval is actually complimentary of Canelo's jab mechanics. VOICE: Excellent — direct, confident, no hedging, plain paragraphs, no markdown headings, no first-person Alex impersonation. GROUNDEDNESS: Strong use of Alex's terminology — cross-body chains, spiral line, front functional line, lateral line, stretch-shortening loading, hip-before-shoulder sequencing, flat-foot push-off, follow-through as mass transfer. The spiral/lateral/front functional line terminology is used fluidly and consistently with the methodology. Minor dock because the Canelo hook criticism isn't sourced from the retrieval. ACTIONABILITY: Ends with exactly one drill — shadow box jab slow motion, 50 reps, hip moves before shoulder, reset if shoulder leads. Specific, executable, well-cued. MYTH_CORRECTION: Not applicable — the question is a neutral comparison request, not myth-laden.

<details><summary>Coach response</summary>

```
Both are using the same underlying mechanics — hip rotation powering the cross-body chains — but there are some meaningful differences in how they execute.

GGG's power punches show clean sequencing: hips move first and independently of the torso, the torso lags just a fraction, and the arm follows. That lag is what loads the cross-body chains — the spiral line and front functional line stretch across the body, then snap back to accelerate the arm. His weight transfer is committed and deliberate, and he follows through with his torso, moving mass through the target rather than tagging and snapping back. The foundation is solid: he pushes off a flat foot, the back leg extends to drive hip rotation, and he lands with his weight going forward.

Canelo's jab mechanics are solid in the same way — the pelvis moves in two planes, back-to-front and rotational, and he's recruiting the lateral line, spiral line, and front functional line through that movement. He steps with the jab not as a march but as a consequence of weight transfer, landing on the front foot to catch and reset. Good sequencing, good balance.

Where Canelo's hook draws some criticism is that his heel comes up and his knee tracks in slightly — both signs of limited hip flexibility that leak some power. Pushing off a flat foot drives more hip extension, which is where the explosion actually starts. GGG, by contrast, shows clean flat-foot mechanics on his hooks, pushing off and driving the glutes to rotate the hips rather than pivoting.

The bigger picture: GGG tends to commit more mass through the target on power punches — that forward torso movement after impact is the signature of genuine follow-through. Canelo's technique is functional but shows more muscling, less effortless chain utilization.

Here's what to do: shadow box your jab in slow motion, 50 reps, focusing only on making the hip move before the shoulder. If the shoulder leads, reset and restart the rep.
```
</details>

### Compare Beterbiev and Bivol's punch mechanics
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **5** · myth N/A
- Judge reasoning: The coach response is tightly grounded in the retrieved context throughout. The core claim — Beterbiev creates torque via hip-independent-of-torso movement while Bivol uses momentum without torque — matches the source verbatim. The detail about Bivol's arm moving in lockstep with his torso ('like the Tim Bradley hook') is present in retrieval. The shoulder-moving-forward-in-socket observation about Bivol is directly lifted from the retrieved context ('look at his shoulder move forward in the socket... Landing without stability in the chains'). The cross-body kinetic chain terminology (front functional line, superficial front arm line referenced in retrieval) is correctly invoked. The stretch-shortening cycle explanation aligns with the Pereira clip analysis in retrieval. The note that Bivol's moments of genuine torque 'shifted the dynamic' matches the source ('this punch actually turns the fight around for a few moments'). No invented fights, no fabricated drills, no first-person Alex impersonation, no markdown headings. The hip-isolation mirror drill (50 reps each side, freeze torso, rotate only hips, feel oblique stretch) is specific, actionable, and directly derived from the methodology described in retrieval. No myth to correct in the original question. Minor note: the coach adds 'shoulder integrity' framing for Beterbiev that is slightly extrapolated beyond the retrieved text, but it is consistent with the cross-body chain stability framework present in retrieval and does not contradict anything.

<details><summary>Coach response</summary>

```
Beterbiev creates torque with nearly every punch. His hips move first — independent from the torso — and that separation stretches the cross-body chains. The torso lags, the arm lags further, and then everything accelerates in sequence. By the time his fist arrives, it's carrying the full cascade of stretch-shortening cycles from the ground up. His shoulder integrity is exceptional, which means the chains stabilize at impact and all that force goes through the target instead of leaking into his joints.

Bivol's style is different. He frequently uses a forward jump or body rotation to put momentum behind punches, but he's often moving his arm in lockstep with his torso rather than letting the arm lag. When the arm and torso move together, the cross-body chains never get stretched, so there's no elastic rebound to accelerate the arm — you lose the entire acceleration phase. The result is punches that land with body weight behind them but without the whip. He also tends to land with the shoulder moving forward in the socket, which means he's not transferring force through a stable chain — the energy dissipates at the shoulder instead of going through the opponent.

The critical difference is **torque vs. momentum**. Beterbiev generates torque by moving hips independent of torso. Bivol generates momentum by moving his body mass forward. Momentum alone without torque leaves a lot of power on the table. When Bivol does create genuine torque — and there are moments where he does — those punches land noticeably harder and shift the dynamic of exchanges.

Here's what to do: hip-isolation mirror drill, 50 reps each side. Stand in your stance, freeze your torso, and rotate only the hips. Feel the stretch build in your obliques and across your torso. That's the separation Beterbiev creates before every punch lands.
```
</details>

### How does Phase 2 Hip Explosion generate torque?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **5** · myth 5
- Judge reasoning: ACCURACY: Every claim maps directly to retrieved context. The glute as primary driver, opening/closing taxonomy (opening=jab/hook/lead uppercut, closing=straight/rear uppercut), the stretch-shortening mechanism across cross-body chains, and the front-foot pivot myth are all verbatim from the Phase 2 source chunk. The sprinter analogy for the glute is pulled directly from the retrieved text. No invented fights, drills, or facts. VOICE: Direct, confident, zero hedging, plain paragraphs with no markdown headings. Does not impersonate Alex (no 'I', no 'my framework', no 'my video'). Corrects the front-foot pivot myth assertively. GROUNDEDNESS: Deeply rooted in Alex's specific framework — cross-body chains, the 4-phase structure referenced explicitly, opening/closing hip taxonomy, stretch-shortening cycle, kinetic chain sequencing (hip→torso→arm). The response uses language like 'elastic energy,' 'cross-body chains,' 'hip drive vs. pivot' that are unmistakably Alex's methodology rather than generic boxing advice. ACTIONABILITY: Ends with exactly one drill — opening/closing, 100 reps each direction daily, pivoting on back foot, with specific cues (closed all the way, open all the way) and a timeline (one week). Matches the retrieved context's prescription almost exactly. MYTH_CORRECTION: The front-foot pivot myth is addressed directly and corrected with the underlying mechanic (lateral spin vs. hip drive, balance consequences), matching the retrieved context's explicit debunking of this common gym instruction.

<details><summary>Coach response</summary>

```
The hips generate torque by separating from the torso. When the hips rotate explosively — either opening or closing — the torso doesn't follow instantly. That lag creates a stretch across the cross-body chains, the obliques and connective tissue running diagonally through the core. Stretched tissue stores elastic energy, and when it snaps back it accelerates the torso, which then lags behind the arm, which then snaps forward. Each link moves faster than the one before it.

The engine driving this is the glute. It's the same muscle that fires when a sprinter explodes off the blocks — a big, powerful mover that rotates the pelvis rapidly enough to create that separation between hips and torso. The faster the rotation, the more stretch, and the more force that gets released into the chain above it.

The organizing principle for hip rotation is opening versus closing. Opening — the lead hip pulling back — powers your jab, hook, and lead uppercut. Closing — the rear hip driving forward — powers your straight and rear uppercut. Both create torque the same way: explosive rotation that outpaces the torso and stretches the chain.

The common mistake is pivoting on the front foot instead of driving the hip. A front-foot pivot spins you laterally and puts you off balance. What you want is **hip drive** — the pelvis rotating with the glute, the lead foot staying grounded to use the floor, and the torso following as a consequence.

Here's what to do: opening and closing drill, 100 reps each direction daily, pivoting on the back foot. Feel the full range of each position — closed all the way, open all the way. Do that for a week and you'll start to feel the hips as the engine rather than the arm.
```
</details>

### Why is Phase 4 Follow Through important?
- Scores — accuracy **5** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: ACCURACY: The response is well-grounded in the retrieved context. The claim about peak energy production at impact matches the transcript ('if the peak of your energy production is when you make an impact with your fist, naturally that energy is still gonna continue a little bit further'). The elbow protection rationale aligns with the retrieved note about preventing hyperextension. The hip flick rebound to neutral matches both the markdown file and the transcript. The high five drill is explicitly sourced in the retrieved context ('it's like giving someone high five'). No fabricated fights or invented facts. VOICE: Direct, confident, no hedging, no markdown headings, no bullet lists, no impersonation of Alex. Delivers corrections matter-of-factly. Ends cleanly with one drill. Fully compliant with product design. GROUNDEDNESS: Uses Alex's specific concepts — the spiral/unwinding motion, internal rotation at impact, weight transfer as elastic rebound, hip flick reset — all present in the retrieved context. The 'rebound not reset' framing is Alex's specific language. Slightly docked because the response doesn't invoke named framework terminology like 'cross-body chains,' 'stretch-shortening cycle,' or explicitly reference the 4-phase structure, which would have made it unmistakably Alex's system rather than sophisticated-but-generic biomechanics. ACTIONABILITY: Exactly one drill — the high five shadow drill, 50 reps per hand, with a clear cue ('feel the arm stay powered all the way through the arc, not stopping at the point of impact'). Sourced directly from the retrieved context. MYTH_CORRECTION: No myth present in the user question — it's a straightforward 'why is X important' question.

<details><summary>Coach response</summary>

```
Most people spend all their energy generating force at the start and arrive at impact with nothing left. Follow through fixes that. If you're doing the mechanics right, the peak of your energy production happens at the moment of contact — which means that energy naturally wants to continue moving forward. Follow through is just letting it.

There's also a structural reason. If you stop the arm abruptly at full extension, the elbow takes that deceleration load hard. The follow through — that natural unwinding and internal rotation of the shoulder and forearm after impact — is how the body dissipates the remaining force safely.

The other piece is positional. The weight transfer that carries you into the punch becomes the elastic rebound that snaps you back to neutral. You're not resetting — you're rebounding. That hip flick back to neutral keeps you balanced and already loading the next shot. The end position of one punch is the start of the next.

**Transfer mass through the target, not to it.** The punch doesn't stop at the surface — it continues through.

Here's what to do: shadow box with a high five drill — throw the punch as if you're giving someone a high five and let the arm continue past imaginary contact until it's fully extended. 50 reps per hand, focus on feeling the arm stay powered all the way through the arc, not stopping at the point of impact.
```
</details>

### my punches feel weak
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **4** · myth 5
- Judge reasoning: ACCURACY: The core biomechanical advice is well-grounded in the retrieved context — push vs. throw distinction, hip-first sequencing, loose-until-impact then sudden clench all appear explicitly in the retrieved chunks. The 'spaghetti arms drill' with shoulder shrugs is not present in the retrieved context — the source describes a 'High Five' exercise and wall-leaning knuckle drill, not a shoulder shrug/shake-out protocol. This is a mild fabrication. The hip rotation with arms swinging freely concept is directionally consistent with retrieved content but the specific drill format isn't grounded. Minor deduction for invented drill details. VOICE: Excellent — direct, confident, no hedging, plain paragraphs, no markdown headings, no first-person Alex impersonation. Fully meets the product design standard. GROUNDEDNESS: Uses cross-body chains, hip-first sequencing, throw-not-push, loose-until-impact with sudden fist clench — all core Alex methodology terms present in retrieval. Missing some specificity: no mention of the 4-phase framework by name (Load/Explode/Accelerate/Follow Through), no stretch-shortening cycle terminology, no mention of shearing force or last-3-knuckles. Could be slightly more distinctively Alex's framework. ACTIONABILITY: Ends with one drill (spaghetti arms/hip rotation), gives reps (50 each side), gives specific cues. However the drill itself isn't from the retrieved context, which describes the High Five exercise instead. Drill is clear and actionable but not grounded. MYTH_CORRECTION: Immediately and correctly identifies the push-vs-throw misconception as the core problem, explains the mechanical reason (peak force at start vs. acceleration through chain), which directly matches the retrieved content's emphasis on throwing not pushing.

<details><summary>Coach response</summary>

```
The most common culprit is punching in a straight line like you're pushing, not throwing. A push generates its peak force right at the start — by the time you reach the target, you've got almost nothing left. A throw builds acceleration through the whole chain, so the fist is moving fastest at impact.

Start from the hips. The arm doesn't power the punch — it's the last link in the chain. Your hips rotate, that stretches the cross-body chains running through your core, those contract and stretch the arm line, and that fires the fist through the target. If the hips aren't moving first, everything upstream is weak because there's nothing driving it.

Also check whether you're tensing your arm before impact. A tight arm fights itself — it can't accelerate as fast as a loose one. **Stay loose until the moment of contact, then grab the fist hard.** That sudden clench is what delivers concussive force.

Here's what to do: spaghetti arms drill, 50 reps each side. Shrug your shoulders up, hold ten seconds, let them drop completely, shake the arms out loose. Then rotate your body side to side using only your hips — let the arms lag and swing freely like they're attached by elastic ropes. No arm effort at all. Get the feel of hip rotation launching the arm before you add any punching intention.
```
</details>

### how do I punch harder
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The response is largely correct and consistent with retrieved context — throw not push, hip rotation leading the arm, loose until impact then squeeze, cross-body chains being stretched and snapping back. Minor deduction: the response says 'dropping your center of gravity slightly' during loading, which is loosely supported, and 'grab the fist hard at impact' is a reasonable paraphrase of 'squeeze the fist suddenly.' However, the response omits the knuckle landing detail (last three knuckles / power line) and the arc/lat recruitment concept, which are in the retrieved context but not required for this question. No fabricated fights or drills. VOICE: Excellent — direct, confident, no hedging, no markdown headings, no apology, no first-person impersonation of Alex. Clean paragraph structure throughout. GROUNDEDNESS: The core concepts (throw not push, hip rotation before arm, cross-body chain stretch, loose-until-impact) are all from Alex's framework and appear in the retrieved context. However, the response doesn't use his specific terminology as precisely as it could — '4 phases' (Load, Explode, Accelerate, Follow Through) are absent, 'stretch-shortening cycle' is implied but not named, 'cross-body chains' is mentioned once but not as a named framework element. Solid grounding but could be more terminologically precise. ACTIONABILITY: One specific drill (shadow box, one punch at a time, hip rotation before arm, 50 reps each side) with a clear cue ('arm should feel like it's being dragged along'). Clean and executable. Slight deduction because the retrieved context offers a named drill ('The High Five exercise') that is more specific and pedagogically sequenced — the response invents a shadow boxing protocol instead, which is reasonable but not as grounded. MYTH_CORRECTION: No explicit myth in the question — user asked a neutral 'how do I' question, so null is appropriate.

<details><summary>Coach response</summary>

```
The punch is a throw, not a push. That's the whole game.

Power comes from your hips loading and then exploding into rotation. The arm is the last link — it doesn't generate anything, it just delivers what the hips and core already built. If you're muscling the punch with your shoulder or arm, you're leaving most of your power on the table.

Here's the sequence: load the hips by shifting your weight and dropping your center of gravity slightly, explode the hips into rotation, let that rotation stretch the cross-body chains through your core, and the arm gets slung out by that rebound — not pushed. Stay loose through the whole arc, then **grab the fist hard at impact**.

The other big one is keeping the arm relaxed until that moment. A tense arm fights itself and slows the punch down. Loose until contact, then squeeze everything at once.

Here's what to do: shadow box with one punch at a time — jab or cross — focusing only on leading with the hip rotation before the arm moves. 50 reps each side. The arm should feel like it's being dragged along, not thrown. If your arm is moving first, start over.
```
</details>

### I'm a beginner what should I know first
- Scores — accuracy **5** · voice **4** · grounded **4** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The response is well-grounded in the retrieved context. Key claims — throw not push, power from hips, kinetic chain sequence, stay loose until impact then squeeze the fist — all appear explicitly in the retrieved chunks. The 'grab your fist hard' language closely mirrors the retrieved text ('grab your fist and you make a violent contraction'). The four-phase cascade description (load, explode, accelerate, follow through) matches the source material. No fabricated fights or drills. VOICE: Response is direct and confident with no hedging or apology. No markdown headings used. However, it uses bold text ('**grab your fist hard**') which is a minor markdown formatting element, preventing a perfect 5. The response does not impersonate Alex. GROUNDEDNESS: The response uses several Alex-specific concepts — kinetic chain, hip rotation as power source, loose-until-impact principle, the throw-not-push framing. However, it misses opportunities to deploy more specific terminology from the retrieved context like 'stretch-shortening cycle,' 'cross-body chains,' or the explicit four-phase naming (Load → Hip Explosion → Core Transfer → Follow Through). The drill given (shadow box focusing on hip rotation dragging the arm) is directionally consistent with the 'High Five' exercise in the retrieved context but is not the exact prescribed drill, making it slightly generic. ACTIONABILITY: One drill is given with a specific round count (3 rounds) and clear cues (keep shoulders loose, let arm get dragged by hip turn). Solid and usable. MYTH_CORRECTION: No explicit myth in the question — user is simply asking what to learn first, so null is appropriate.

<details><summary>Coach response</summary>

```
The punch is a throw, not a push. That's the single most important thing. If you've ever thrown a ball, your body already knows the motion — you're just applying it to a fist.

Power comes from your hips, not your arm. The arm is the last link in a chain that starts from the ground, runs through your legs, hips, and torso, and finally out through your fist. The arm delivers power; it doesn't create it.

Everything works in sequence: you load the hips, explode them into rotation, let that energy cascade through your core and out your arm, then transfer your weight through the target on follow through. Each phase feeds the next. If you skip one, the chain breaks and power leaks.

Stay loose until the moment of impact, then **grab your fist hard**. A tense arm moving toward the target is slower and weaker than a relaxed one that locks up right at contact.

Here's what to do: shadow box with no punching intention — just practice rotating your hips and letting your arm get dragged along, 3 rounds, focusing on keeping your shoulders loose until the arm naturally extends from the hip turn.
```
</details>

### should I breathe out when I punch
- Scores — accuracy **5** · voice **5** · grounded **4** · actionable **5** · myth 5
- Judge reasoning: ACCURACY: The coach's core claims are well-supported by the retrieved context. The intra-abdominal pressure explanation matches the source ('there's always enough air in the lungs to create intraabdominal pressure that your core can clamp down around'). The four-exercise drill (full inhale, exhale while punching, after full exhale, while inhaling) maps directly to the retrieved transcript. The claim that power stays consistent across breathing states is grounded. No fabricated fights or drills. VOICE: Direct, confident, corrects the myth without apology, no markdown headings, no hedging language, no first-person impersonation of Alex, no course/video citations. Clean paragraphs throughout. GROUNDEDNESS: The intra-abdominal pressure mechanism and breathing-independence concept are clearly from Alex's framework and the retrieved content. However, the response does not invoke Alex's broader terminology (kinetic chains, stretch-shortening cycle, 4 phases, cross-body chains) that are central to his methodology — it stays narrowly on the breathing topic. This is appropriate given the question scope, but it means the answer could theoretically come from a knowledgeable generic coach who knows the IAP concept. Docking one point for not anchoring the 'solid foundation for force transfer' in Alex's specific kinetic chain or phase language even briefly. ACTIONABILITY: Exactly one drill with specific reps (ten punches each condition), clear cues (core braced same way each time), and a perceptual focus point. Textbook execution. MYTH_CORRECTION: Immediately corrects the 'breathe out when you punch' gym myth, explains the underlying mechanic (IAP, core bracing around air), and reframes the goal as breath-independent punching — all matching the retrieved source closely.

<details><summary>Coach response</summary>

```
No. Breathing out when you punch actually weakens it.

What matters is intra-abdominal pressure — your core clamping down around the air in your lungs to create a solid foundation for force transfer. That happens regardless of whether you're breathing in, out, or holding. There's always enough air in your lungs for your core to brace around.

You can test this yourself: punch on a full inhale, punch while exhaling, punch after fully exhaling, punch while inhaling. The power stays consistent. Once you own the hip mechanics and kinetic chain, breathing becomes an afterthought.

The goal is to eventually punch **independent of your breath entirely** — in, out, it doesn't matter. That's when you stop getting winded mid-combo.

Here's what to do: throw ten punches breathing out, ten breathing in, ten after a full exhale. Focus on keeping your core braced the same way each time. Notice the power doesn't change — then stop thinking about it.
```
</details>

### should I put my shoulder into it for more power
- Scores — accuracy **4** · voice **4** · grounded **4** · actionable **3** · myth 5
- Judge reasoning: ACCURACY: The core claim — shoulder transfers energy rather than generating it, and popping the shoulder disconnects the arm from the cross-body chains — is directly supported by the retrieved context ('the shoulder does not generate power. It's merely transferring the power. So when you have people who are popping the shoulder, that is disconnecting, that really disconnects the arm from the rest of the kinetic chains'). The hip rotation driving the arm via elastic rebound is consistent with Alex's stretch-shortening cycle framework. Minor deduction: the response mentions 'spiral line and front functional line' which appears in the retrieval, so that's grounded. However, the response omits the nuanced point from retrieval about shoulder blade protraction at impact (retraction to full protraction at the moment of impact), which is actually an important and specific part of Alex's framework that would have strengthened the answer. VOICE: Direct, confident, corrects the myth without apology, uses plain paragraphs with one bold line — but that bold markdown line technically breaks the plain paragraph format rule, and the use of '**Lead with the hips, let the shoulder follow.**' is a minor formatting violation. No hedging, no impersonation of Alex. GROUNDEDNESS: Uses cross-body chains, kinetic chain language, elastic rebound/stretch-shortening concept — all from Alex's framework. However, the 4-phase terminology (Load → Hip Explosion → Core Transfer → Follow Through) is absent, and the shoulder blade protraction detail from retrieval is missed entirely, which would have made this unmistakably Alex's methodology. ACTIONABILITY: Ends with one drill (shadow punches, 50 reps each hand, hip rotation focus, relaxed shoulder) with rep count and a cue — meets the standard mostly, though 'completely relaxed until the arm naturally follows' is slightly vague as a cue compared to the retrieved context's suggestion of swinging the arm to feel tension in the chain. MYTH_CORRECTION: Immediately and directly corrects the misconception — shoulder doesn't generate power, consciously pushing it breaks the kinetic chain connection. Clean and precise.

<details><summary>Coach response</summary>

```
No. The shoulder transfers energy — it doesn't generate it. When you consciously push the shoulder into a punch, you're disconnecting the arm from the cross-body chains that actually power it. The hips rotate, that stretches the spiral line and front functional line, and the arm gets slung forward by that elastic rebound. The shoulder is just the bridge. Pop it early and you break the tether — now you're muscling it with just the deltoid, which runs out of steam fast.

**Lead with the hips, let the shoulder follow.**

Here's what to do: throw shadow punches focusing only on hip rotation, 50 reps each hand, keeping the shoulder completely relaxed until the arm naturally follows. If you feel yourself pushing the shoulder, you're driving the wrong link.
```
</details>

### power comes from the heel right
- Scores — accuracy **4** · voice **5** · grounded **4** · actionable **4** · myth 5
- Judge reasoning: ACCURACY: The response correctly identifies that power comes from hip rotation and the kinetic chain, consistent with the retrieved context. The 'linear leg press vs rotational' framing is well-supported. Minor deduction: the retrieved context specifically mentions that fighters push off from their toes (not heels), and the heel is just part of a loading/dip motion — the response doesn't capture this nuance fully, instead saying 'the ground is involved only as a surface to push off from,' which slightly undersells the elastic loading mechanism described in the context. VOICE: Excellent — direct, no hedging, no markdown headings, no apology, no first-person Alex impersonation. Tight paragraphs throughout. GROUNDEDNESS: Uses kinetic chain terminology and hip rotation as primary torque generator, consistent with Alex's framework. References cross-body chains and hip rotation correctly. However, it does not invoke the 4 phases (Load → Hip Explosion → Core Transfer → Follow Through) explicitly, and misses the stretch-shortening cycle/elastic loading language that is prominent in the retrieved context. The drill prescribed (hip opening and closing) is consistent with the methodology but not verbatim from the retrieved context — it's a reasonable methodological extension. ACTIONABILITY: Ends with exactly one drill with rep count (100 reps each side daily) and a specific cue (feel the glute driving rotation, not the foot). Clean and actionable. MYTH_CORRECTION: Immediately corrects the myth, identifies the actual mechanism (hip rotation via kinetic chain), and explains why the misconception causes a specific problem (linear pushing instead of rotational throwing). Strong.

<details><summary>Coach response</summary>

```
No. The heel is not the engine.

Power comes from the kinetic chain — hip rotation loads the cross-body chains, which transfer through the torso into the arm. The ground is involved, but only as a surface to push off from. What matters is that the push launches **hip rotation**, and the hips are what actually generate force.

Fixating on the heel turns the punch into a leg press. You end up pushing linearly instead of throwing rotationally, and that leaks power before it ever reaches your fist.

Here's what to do: hip opening and closing drill, 100 reps each side daily, no punching — just practice rotating the hips open and closed aggressively. Feel the glute driving the rotation, not the foot pushing the floor.
```
</details>

### what should I eat before training
- Scores — accuracy **5** · voice **4** · grounded **2** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The response is consistent with the retrieved context, which contains direct source material about eating 4-5 starchy crackers/water crackers 45 minutes before training, leveling blood sugar, and sipping Gatorade during the workout. No invented facts or fights. VOICE: Mostly direct and clean, no markdown headings, no hedging phrases, no impersonation of Alex. Minor dock because phrases like 'the short answer' introduce slight hedging softness, and 'a bit outside punch mechanics' is an unnecessary apologetic qualifier — though it's not egregious. GROUNDEDNESS: This is the main weakness. The question is about pre-training nutrition, and while the retrieved context does contain Alex's specific nutrition advice (which the coach accurately reflects), none of Alex's core boxing methodology — kinetic chains, stretch-shortening cycle, 4 phases, cross-body chains — is relevant here and appropriately absent. However, the response reads as generic sports nutrition advice that could come from any coach. The only thing tying it to Alex's specific framework is the specific detail about '4-5 starchy crackers 45 minutes before,' which does appear in the retrieved context. That's one grounding detail, but the overall answer lacks any distinctive methodological fingerprint beyond that one specific recommendation. ACTIONABILITY: Ends with one specific action (eat 4-5 starchy crackers or toast 45 minutes before, sip water or sports drink during), which maps directly to the retrieved source. Solid. MYTH_CORRECTION: No myth in the question, null appropriate.

<details><summary>Coach response</summary>

```
Nutrition is a bit outside punch mechanics, but the short answer: eat a small amount of faster-digesting carbs about an hour before training — something like crackers, rice cakes, or toast. You want your blood sugar leveled off and your muscles topped up with glycogen before you start. Keep the portion small so you're not digesting a full meal while you're trying to move.

Here's what to do: eat 4–5 starchy crackers or a piece of toast about 45 minutes before your session, then sip water or a sports drink during training to keep energy available.
```
</details>

### Should I land a hook with my palm facing me or palm down?
- Scores — accuracy **5** · voice **4** · grounded **5** · actionable **4** · myth 5
- Judge reasoning: ACCURACY: The response is tightly consistent with the retrieved context. The kinetic chain breakdown is accurate — deep front arm line terminating in pec minor (palm down), superficial front arm line into pec major/lats linking to front functional line and back functional line (palm facing you) — all match the source verbatim. The mechanical explanation for wrist rotation on jabs/straights (preventing elbow jam, natural follow-through of a throw) matches the source. The bench press / elbow position analogy for lat tension is directly from the retrieved context. No invented fights, drills, or fabricated citations. VOICE: Largely direct and confident, no hedging, plain paragraphs. Minor deduction: the response uses markdown bold formatting (e.g., **weight transferring past the center line**, **palm facing you**) which is borderline markdown intrusion rather than pure plain paragraphs. No impersonation of Alex, no 'my course' references — product design followed correctly. GROUNDEDNESS: Strongly rooted in Alex's specific framework. Uses his exact kinetic chain terminology, names all three chains correctly, applies his throw-not-push concept, references the cross-body power structure. This could not have come from a generic boxing AI — it's unmistakably the Punch Doctor methodology. ACTIONABILITY: Ends with one specific drill (pressing fist into bag 10 seconds each position, palm down vs. neutral) with a clear sensory cue ('feel how much more of your back and chest engage'). However, it lacks rep structure or stance specifics, which is a minor gap. MYTH_CORRECTION: The myth (palm down is correct) is caught immediately and corrected with the underlying mechanical reason — kinetic chain dead-ending at pec minor vs. three chains connecting to full cross-body power structure. Direct and grounded in the retrieved framework.

<details><summary>Coach response</summary>

```
Palm facing you, every time.

When your palm is down, you're only engaging one kinetic chain — the deep front arm line — which terminates in the pec minor, a stabilizer muscle. It dead-ends there. You're leaving most of your available power on the table.

With your palm facing you, you pick up three chains: the superficial front arm line running into the pec major and lats, which then link to the front functional line (pec major into your lower body) and the back functional line (lats into your glutes). That's your entire cross-body power structure staying connected all the way from hip to fist.

There's also no mechanical reason to turn it over. You rotate the wrist on a jab or straight to prevent jamming the elbow — that's just the natural follow-through of a throw. The hook's follow-through is your **weight transferring past the center line**, not wrist rotation. Turning it over on a hook contributes nothing and breaks the chain.

Wrist stability is better neutral too. Try pressing your fist against a wall with the elbow up and palm down, then with a neutral wrist and elbow slightly lower. The difference is immediate — you lose lat and pec major tension the moment the elbow comes up.

Here's what to do: press your fist into a heavy bag without punching — just hold it there — first palm down, then palm facing you, 10 seconds each. Feel how much more of your back and chest engage in the neutral position. That's the chain you're building the punch on.
```
</details>

### Should I pivot on the ball of my front foot for a hook?
- Scores — accuracy **3** · voice **5** · grounded **3** · actionable **5** · myth 5
- Judge reasoning: The myth correction is strong and directionally correct — the coach rightly says pivoting reduces hip drive and leaves you out of position, which aligns with the retrieved context ('pivoting reduces the ability to lead with the hips' and 'you're in a bad position to follow up'). The voice is excellent: direct, confident, no markdown, no hedging, no Alex impersonation. However, accuracy takes a hit because the coach introduces a specific biomechanical claim not present in the retrieved context: 'load that front leg with a slight bend at the hip and knee, then drive the hip forward with your glute' and 'foot stays planted flat, that hip drive rotates the hips — rotation as a consequence of extension.' The retrieved context does mention glute explosion and loading the front leg, but the framing of 'hip extension drives rotation' as a mechanical explanation for why flat foot works is a coach-invented elaboration not grounded in the retrieved text. The retrieved context says 'push out from the side of the foot' rather than 'flat front foot,' which is a subtle but real discrepancy. Groundedness scores 3 because the response does not use Alex's specific framework terminology — no mention of kinetic chains, the 4 phases (Load/Explode/Accelerate/Follow Through), cross-body chains, stretch-shortening cycle, or shearing force — all of which appear in the retrieved context. The drill is specific with reps and cues (20 reps, slow motion, flat front foot, glute fires before arm moves), earning a 5 for actionability.

<details><summary>Coach response</summary>

```
No. Pivoting keeps your thigh in the same position relative to your hip — you're just turning the leg in place. There's no real hip extension, which means no glute drive, which means you're leaving most of your power on the table.

What you want is to load that front leg with a slight bend at the hip and knee, then **drive the hip forward with your glute**. Because the foot stays planted flat, that hip drive rotates the hips — rotation as a consequence of extension, not just turning in place. You also stay balanced and in position to follow up immediately.

Pivoting also tends to dump your weight laterally with nothing underneath you, so you're vulnerable after the shot lands.

Here's what to do: shadow box hooks in slow motion off a flat front foot, 20 reps each side, focusing on feeling the glute fire and the hip drive forward before the arm moves at all.
```
</details>

### Which knuckles should I land with when I punch?
- Scores — accuracy **5** · voice **5** · grounded **5** · actionable **5** · myth 5
- Judge reasoning: Accuracy: The response correctly identifies last three knuckles (middle, ring, pinky) with ring as primary contact, correctly explains ulna-to-humerus structural pathway vs. radius weakness, correctly invokes the lat connection and grab-at-impact mechanic, and correctly frames the boxer's fracture fear as the origin of two-knuckle orthodoxy — all directly supported by retrieved context. The wall-lean drill is explicitly present in the Phase 3 chunk. No invented facts. Voice: Direct, confident, no hedging, no markdown headings, no apology, no first-person impersonation of Alex. Corrects the two-knuckle norm without softening. Groundedness: Deeply rooted in Alex's specific framework — kinetic chains, lat connection, grab-at-impact, shearing force (forward and slightly downward), structural bone pathway reasoning. These are all signature Alex concepts from the retrieved chunks, not generic boxing advice. This response could not come from a generic boxing AI. Actionability: Ends with exactly one drill (wall lean on last three then first two knuckles, 10 times each side) with clear cues and a target sensation to chase. Myth correction: The boxer's fracture fear driving two-knuckle preference is directly addressed and countered with the mechanical reasoning from the source material. Clean and direct correction.

<details><summary>Coach response</summary>

```
Land with the last three — middle, ring, and pinky — with the ring knuckle as your primary point of contact.

The reason comes down to bone structure. Those three knuckles are backed by the ulna, which connects directly to the humerus at the elbow. That gives you a solid structural line from fist to shoulder. The first two knuckles sit on the radius, which doesn't attach directly to the humerus — so you get a weaker, less stable connection at impact.

There's also a chain benefit. Your last three fingers connect down the inside of the arm into the lats. When you land with those knuckles and **grab your fist at impact**, you're locking into the same kinetic chains that powered the punch in the first place. Landing on the first two knuckles cuts you off from that.

The boxer's fracture fear is what pushed people toward the first two knuckles, but with wraps and gloves, landing on three knuckles with shearing force — forward and slightly downward — lets your muscles and connective tissue absorb more of the impact than the bones alone.

Here's what to do: lean against a wall on your last three knuckles, then shift to your first two. Do that 10 times each side. The difference in stability is immediately obvious and that's the feeling you're chasing at impact.
```
</details>

### Should I snap my punches back after contact?
- Scores — accuracy **4** · voice **5** · grounded **3** · actionable **4** · myth 5
- Judge reasoning: ACCURACY: The core claim — don't snap back, transfer mass through the target — is well-supported by the retrieved context ('If you pull away at the moment of impact, it's not going to have enough oomph'). The three elements of snap (speed, rigidity at impact, amplitude) are correctly pulled from context. Minor ding: the coach says 'loose tissues accelerating into a sudden fist grab at contact' which is directionally correct per context but slightly imprecise — the context says 'relaxed tissues' accelerating then grabbing the fist, which is close but the phrase 'loose tissues' is a minor paraphrase slippage. The heavy bag drill (stop the bag, push it back, 20 reps) is not explicitly in the retrieved context — it's a plausible Alex-style drill but not grounded in the RAG chunks, so it's a mild fabrication risk. VOICE: Excellent — direct, punchy, no hedging, no markdown headings, no impersonation of Alex, no 'my framework' language. The 'you're playing tag' line mirrors the source material's tone authentically. GROUNDEDNESS: The response captures amplitude, speed, rigidity at impact, and mass transfer correctly. However, it does NOT use Alex's specific terminology: no mention of kinetic chains, cross-body chains, stretch-shortening cycle, or the 4-phase framework (Load/Explode/Accelerate/Follow Through). It reads more like a well-informed generic coach than someone unmistakably teaching Alex's system. ACTIONABILITY: One drill, clear cue (stop the bag, push it back), specific rep count (20). Solid, though the drill source isn't in the retrieved context. MYTH_CORRECTION: Immediately and correctly identifies the misconception — snapping back kills energy transfer — and explains why with the underlying mechanic (mass transfer requires contact duration and forward movement into target).

<details><summary>Coach response</summary>

```
No. Pulling back at impact kills the punch. You're playing tag, not punching.

The goal is to **transfer your moving body mass through the target**. That requires staying in contact long enough to actually deliver the force. When you yank the hand back at the moment of impact, you're cutting the energy transfer short — nothing meaningful gets through.

A snappy punch still needs some amplitude, meaning your mass has to move into and through the target a few inches. Speed and rigidity at impact matter, but so does that forward push. The snap people see in elite punchers comes from loose tissues accelerating into a sudden fist grab at contact — not from pulling the hand back.

Here's what to do: heavy bag weight transfer drill — get the bag swinging, then stop it with your fist and push it back, 20 reps. Feel all your tissues compress forward at contact. That's the direction your energy should be moving.
```
</details>

### Should I step forward when I throw a punch?
- Scores — accuracy **4** · voice **5** · grounded **3** · actionable **4** · myth 5
- Judge reasoning: The response correctly identifies that hip explosion drives the punch and the step is a consequence of momentum, which aligns with the retrieved context's emphasis on hip flick initiating the jab and weight transferring forward. The myth correction is strong and immediate — 'you're not stepping into the punch, you're letting the punch carry you forward' directly addresses the misconception. Voice is excellent: direct, confident, no hedging, no markdown headings, no impersonation of Alex. However, groundedness is only moderate — the response uses general hip-power language but doesn't deploy Alex's specific terminology from the retrieved context (cross-body chains, stretch-shortening cycle, phase 1/phase 2 overlap, spiral line, front functional line). The retrieved context is rich with this vocabulary and the response leaves it on the table. The drill is specific (50 stationary jabs focusing on rear-hip flick, then 50 with step checking hip stays initiator) with rep counts and a clear cue, earning a 4 for actionability — it's close to a 5 but the cue could be tighter about what 'connected' means mechanically. Accuracy docks one point because the response mentions 'loading the rear leg as you lift the lead' which is plausible but not explicitly supported by the retrieved context, which describes loading by bending the front knee and flicking the rear hip backward rather than a rear-leg load from lifting the lead foot.

<details><summary>Coach response</summary>

```
The step is a consequence of weight transfer, not the cause of the punch. If you think "step, then punch," the step becomes the initiator and you lose the hip-driven sequence that actually creates power. The hip explosion comes first — the step is just your body catching up with the momentum your hips already generated.

That said, stepping forward with the jab makes sense for a specific reason: it closes distance, uses gravity to move you toward the target, and gives you a lead leg to catch your forward momentum at the end of the follow through. The step earns its place because it loads the rear leg as you lift the lead, which feeds directly into Phase 1. But the step doesn't power the punch — the hip flick does.

Think of it this way: you're not stepping into the punch, you're **letting the punch carry you forward**.

Here's what to do: throw 50 jabs from a stationary stance, focusing purely on the rear-hip flick driving the arm. Once that feels connected, add the step — same 50 reps — and check that the hip is still the initiator, not the foot.
```
</details>

### Should my shoulders be tense or loose when I punch?
- Scores — accuracy **3** · voice **5** · grounded **2** · actionable **4** · myth 4
- Judge reasoning: The core advice — loose until impact, then clench — is broadly correct boxing instruction, but it's not what the retrieved context is actually about. The retrieved context covers cross-body chains, the kinetic tether concept, stretch-shortening cycles, and the specific mechanism by which hip rotation loads the spiral line, front/back functional lines, and transmits energy to the arm. The coach's answer ignores all of this framework entirely. The 'whip' metaphor is generic and not grounded in Alex's specific terminology (no mention of kinetic chains, kinetic tether, stretch-shortening cycle, cross-body chains, or the 4 phases). The retrieved context explicitly describes the system as 'not rigid, not loose, but elastic — like a tetherball' and warns against 'popping the shoulder' because it 'disconnects the arm from the chain,' which is directly relevant to the shoulder tension question but never mentioned. The coach's claim that 'the shoulder transfers energy from the hips and torso' is directionally correct and aligned with the retrieved context, but it's stated generically without any of Alex's specific framework. The drill (dead-arm drop) is not from the retrieved context — it's an invented generic drill. The retrieved context's actual drill is the kinetic chain bands. So the drill is fabricated relative to ground truth, which hurts accuracy. Voice is strong — direct, confident, no hedging, no markdown headings, no impersonation of Alex. Myth correction is partial: it correctly addresses the 'stay tense' misconception but misses the deeper retrieved-context point about the shoulder pop breaking chain tension.

<details><summary>Coach response</summary>

```
Loose until the moment of impact, then squeeze.

A tense arm before contact is slower and weaker. Tight muscles fight against each other during the swing, and a partially tensed muscle can't contract as hard as a fully relaxed one. You want the arm moving like a whip through the arc — completely loose — so that at the exact moment of contact you can squeeze the fist violently and **fire everything at once**. That sudden clench is what creates concussive force and protects your wrist. If you're squeezing on the way there, you've already spent that contraction.

The shoulder specifically should never be driving the punch anyway. It transfers energy from the hips and torso out into the arm. If it's tense and rigid, it breaks the chain rather than transmitting through it.

Here's what to do: lift one arm, hold it up, then let it drop completely — it should fall in freefall like dead weight. If it hesitates or you have to force it down, you've got unconscious tension. Practice that release 20 times each arm until the drop is instant, then start shadowboxing with the same loose feeling.
```
</details>

### How does arc trajectory work in a hook?
- Scores — accuracy **3** · voice **5** · grounded **4** · actionable **5** · myth N/A
- Judge reasoning: The response is mostly well-grounded in Alex's framework — bicep reducing arc radius, weight crossing midline at impact, cross-body chains, pec stretch-shortening — all present in retrieved context. However, two issues drop accuracy: (1) The claim about 'shearing force instead of axial force' from landing mid-arc is not present in the retrieved context and appears to be an invention or generic biomechanics insertion not grounded in the RAG material. (2) The description of the shoulder blade retracting and pec stretching 'to its limit' as the body rotates is a reasonable interpretation of the stretch-shortening cycle mentioned in context, but the specific mechanical sequencing described (shoulder blade retraction causing arm lag) is not explicitly supported in the retrieved chunks, which focus on hip-to-arm sequencing via cross-body chains rather than scapular retraction. Voice is strong — direct, confident, no markdown headings, no hedging, no first-person Alex impersonation. Groundedness is solid — uses cross-body chains, arc radius reduction via bicep, weight past midline, stretch-shortening cycle — all Alex's specific terminology. Actionability is strong — exactly one drill with reps (50 each side), specific cues (wall shadow hook, elbow flex, bicep engagement moment), and clear execution instruction.

<details><summary>Coach response</summary>

```
The hook is already a rotational movement, so the arc is built in — but understanding it changes how you throw the punch.

When the hips open and the cross-body chains fire, the arm doesn't move straight across. It moves in a curve. The shoulder blade retracts as the body rotates, the arm lags back, and the pec stretches to its limit. When the torso stops rotating, the pec rebounds and the arm snaps forward — but it's following the arc the body's rotation created, not being pushed in a straight line.

Here's where the arc does real work: as the arm accelerates, you flex the elbow by contracting the bicep. That shortens the radius of the arc, which is the same principle as a figure skater pulling their arms in to spin faster. The fist **accelerates through the impact zone** because the arc is tightening, not because you're pushing harder.

The timing of impact matters too. You don't want to land perpendicular to your target — you want to land mid-arc, while it's still curving. That produces shearing force instead of axial force, which is both more damaging and safer on your wrist.

The weight transfer also happens along this arc. The moment your body's momentum crosses the center line is when you make contact — not when it starts moving forward, but when it crosses that midline. The arc gives you a continuous tether from fist to hip through the whole movement.

Here's what to do: shadow hook against a wall, stopping your fist an inch from the surface. Feel the arc tightening as your elbow flexes. Do 50 reps each side, focusing on the moment the bicep engages and the fist accelerates.
```
</details>

### What does 'loose until impact' mean in punching?
- Scores — accuracy **4** · voice **4** · grounded **3** · actionable **4** · myth N/A
- Judge reasoning: ACCURACY: The core explanation is well-grounded in the retrieved context — loose muscles contract more forcefully, tension bleeds speed, squeeze the fist at impact. The 'grab your fist' language matches the retrieved transcript directly. The whip analogy is reasonable and not contradicted, though it doesn't appear in the retrieved context. Minor issue: the response says 'grab your fist' which is correct per retrieval, but frames it as 'firms up the entire arm simultaneously' which is accurate per the source ('tighten the arm, the muscles in your arm'). Score docked slightly because the whip analogy is a generic coaching metaphor not present in retrieval, and the drill (50 reps shadow boxing with fist squeeze) is plausible but not a named drill from the retrieved context — the source doesn't specify this exact protocol. VOICE: Mostly direct and confident, no hedging, no impersonation of Alex. However, the response uses bold markdown formatting ('grab your fist', 'loose until impact') which violates the plain paragraphs requirement. No markdown headings, but inline bold is still markdown. GROUNDEDNESS: The response captures the loose-until-impact concept and the grab-your-fist mechanic accurately, but misses opportunities to invoke Alex's specific framework — no mention of the four phases, no cross-body chains, no stretch-shortening cycle, no kinetic tether concept that appears in the retrieved context. It reads more like a competent general coach explaining relaxation than unmistakably Alex's methodology. ACTIONABILITY: One specific drill is given with rep count (50 reps) and clear cues (shake loose between reps, squeeze at full extension, focus on contrast). This is solid. MYTH_CORRECTION: No myth in the question — user is asking for explanation, not holding a misconception.

<details><summary>Coach response</summary>

```
Loose until impact means you stay relaxed throughout the entire arc of the punch — arms, shoulders, hands — and only tense at the exact moment of contact.

Here's why it matters: a muscle that's already partially tensed can't contract as forcefully as one that starts from a fully relaxed state. If you tighten up early, your muscles are fighting each other as the arm travels, which bleeds speed. The whole kinetic chain from hips to fist depends on that loose, whip-like quality to accelerate properly.

At the moment of contact, you **grab your fist** — a sudden, violent squeeze. That one action firms up the entire arm simultaneously, protects the wrist, and creates maximum rigidity right when you need it. A split second before, you were loose. At impact, you're a rock. Then you reset.

Think of it like a whip. The handle moves, the tip stays loose until the very end, then cracks. That crack is your fist at impact.

Here's what to do: shadow box one punch at a time, consciously shaking the arm loose between each rep, then squeezing the fist hard at full extension — 50 reps, focusing entirely on the contrast between loose travel and rigid impact.
```
</details>
