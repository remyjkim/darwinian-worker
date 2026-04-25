---
name: polish-voice-research
description: Polish research blog posts into the "grounded inquiry" voice used by Curation Labs Research. Use this skill when the user asks to polish, tighten, or edit the voice/tone of a research essay or blog post, when they mention "voice pass," "tone pass," or "polish the writing," or when a draft is complete and needs its prose refined to match the established voice. Also trigger when the user references the writing style of the OEL or SeekerGym posts and wants to match it.
---

# Polish Voice: Grounded Inquiry

This skill applies a prose polish pass to research blog posts, bringing them into a voice we call **grounded inquiry**: the register of a researcher who presents evidence and lets the reader think, rather than lecturing.

The voice emerged from the Curation Labs Research essay series (The Two Loops, What You Ask is What You Know). It balances intellectual seriousness with accessibility, technical precision with readability. The core principle: the writing should feel like a knowledgeable colleague walking you through what they found, inviting you to reason alongside them.

---

## The Nine Properties

When polishing a draft, look for passages that violate any of these. Each property includes what to look for and how to fix it.

### 1. Evidence-led

Claims are grounded in findings, observations, or data. The prose presents evidence and lets the reader arrive at the conclusion.

**What to catch:**
- Declarative verdicts: "This is wrong," "This approach is flawed," "It is clear that"
- Claims stated as universal truths without grounding: "X always leads to Y"
- Assertions that position the author as judge rather than guide

**How to fix:**
- Ground the claim in what produced it: "The data says otherwise," "According to these results," "The experiments showed"
- Let the evidence carry the weight. If a finding is strong, stating it plainly is more convincing than editorializing about it.

**Before:** "This assumption is wrong."
**After:** "The data says otherwise."

**Before:** "Raw trajectory is clearly the worst approach."
**After:** "Raw trajectory performed worst across every model tested."

### 2. Concrete-first

Show the example, scenario, or artifact before naming the principle. The reader encounters the thing, then learns what to call it.

**What to catch:**
- Sections that open with an abstract definition or framework, then illustrate with an example
- Paragraphs that name a concept ("This is called X") before the reader has felt why X matters

**How to fix:**
- Invert the order. Lead with the scenario, the data, or the artifact. Name the principle after the reader has experienced it.

**Before:** "The Rumsfeld Matrix distinguishes four types of knowledge. Known knowns are... For example, a researcher studying the tire market..."
**After:** "Your boss asks for a report on the tire market. You open a browser... [scenario plays out] ... Donald Rumsfeld's taxonomy captures this structure."

### 3. Rhythmic punch

Short sentences (under 10 words) deliver conclusions and turns. Longer sentences carry reasoning, context, and nuance. The contrast between them creates rhythm that keeps the reader engaged.

**What to catch:**
- Key claims buried in long compound sentences
- Sequences of same-length sentences that create monotone
- Conclusions that are softened by unnecessary qualification or hedging within the same sentence

**How to fix:**
- Extract the conclusion into its own short sentence. Let it land.
- Follow a long explanatory sentence with a short one that delivers the point.

**Before:** "As the trajectory grows longer, the signal increasingly drowns in noise, which means the model ends up spending its limited attention on passages it has already processed."
**After:** "As the trajectory grows, signal drowns in noise. The model spends its limited attention on passages it has already processed."

**Before:** "The result was that the pile of information grew but the report quality did not actually seem to improve."
**After:** "The pile grows. The report does not improve."

### 4. Observational, not prescriptive

The prose observes patterns and presents findings. It trusts the reader to draw implications. It never sounds like a manual or a sermon.

**What to catch:**
- "You must," "You should," "It is essential that," "It is imperative"
- Sentences that tell the reader what to think or do rather than what was found
- Phrasing that positions the author as authority issuing instructions
- Strings of declarative "X is Y" statements that feel like doctrine

**How to fix:**
- Reframe as observation: "appears to matter more," "the results suggest," "this turned out to be"
- Trust the reader. If you've shown the evidence well, you don't need to spell out the lesson.
- Use comparative framing ("the gap was larger than") rather than absolute framing ("this is the most important")

**Before:** "You must structure your beliefs carefully if you want good exploration."
**After:** "How you organize what you know appears to matter more than how powerful your model is."

**Before:** "Architecture matters more than scale."
**After:** "The gap between raw trajectory and structured belief was larger than the gap between different foundation models on the same task."

### 5. Structural analogies

Every analogy maps precisely onto the technical concept it illustrates. The analogy does structural work: each element of the analogy corresponds to an element of the idea. No decorative metaphors, no analogies that are "vaguely similar."

**What to catch:**
- Analogies that share a mood or aesthetic with the concept but don't map structurally (e.g., "knowledge is like a river" without specifying what the water, the banks, and the current correspond to)
- Analogies introduced and then abandoned without being threaded through the argument
- Multiple competing analogies for the same concept

**How to fix:**
- For each analogy, verify: does every element of the analogy correspond to a specific element of the technical idea? If not, either tighten the mapping or cut the analogy.
- Once an analogy is introduced, use it as a recurring reference point. Callbacks to the analogy later in the piece (e.g., "the tattoo" returning in the conclusion) create coherence.

**Good example:** Memento tattoo = belief representation. The tattoo is a compressed record (= structured belief). Its quality determines the protagonist's decisions (= the agent's question quality). A bad tattoo sends him down destructive paths (= raw trajectory degrading performance). Every element maps.

### 6. Callbacks over transitions

Connect sections by returning to a concrete image, scenario, or phrase from earlier in the piece. Avoid explicit transition phrases that tell the reader what you just said or are about to say.

**What to catch:**
- "As we discussed above," "As mentioned in the previous section," "Returning to our earlier point"
- "Now let us turn to," "Having established X, we can now consider Y"
- Opening paragraphs that summarize the previous section before starting the new one

**How to fix:**
- Bring back a concrete detail. "The tire market researcher from the opening has a digital counterpart now" does the work of a transition without sounding like one.
- If a connection to an earlier section is needed, make it through a shared concept or image rather than explicit cross-reference.

### 7. Measured confidence

The prose acknowledges what isn't known, what remains uncertain, and where the limits of the findings lie. It avoids overselling, hype, and false certainty.

**What to catch:**
- "Groundbreaking," "revolutionary," "unprecedented," "game-changing"
- Claims without hedging where hedging is warranted
- "We have shown that" when the evidence supports "the results suggest that"
- Framing research as settled when it's early-stage

**How to fix:**
- Use honest hedges: "appears to," "the field has barely begun," "this is a tractable research problem"
- Distinguish between what was measured and what is inferred
- State limitations directly rather than burying them

### 8. Lead with the point

Section openings state the claim, present the concrete thing, or pose the question that the section will answer. No preamble, no throat-clearing, no recap of what came before.

**What to catch:**
- Section openings that begin with "In the previous section, we established..."
- Opening sentences that begin with "Here is why" or "It is important to note that"
- Multiple setup sentences before the section's actual subject appears

**How to fix:**
- Delete the wind-up. Start with the first sentence that would survive if you deleted everything before it.
- If context from a previous section is truly needed, compress it into a subordinate clause within the first real sentence, or use a callback (Property 6).

**Before:** "In The Two Loops, we established that foundation models are powerful knowledge substrates. We also identified two architectural limitations. The second, partial observability, concerns whether they can see enough of the world. It is this second limitation that turns out to be the deeper bottleneck."
**After:** "A foundation model operates within a bounded context window. In multi-turn settings, the standard practice is to feed it the complete trajectory."

### 9. Questions as invitations

Questions invite the reader to think alongside the author. They open a line of inquiry rather than cornering the reader into a predetermined answer.

**What to catch:**
- Rhetorical questions with obvious answers ("Isn't it clear that X?")
- Leading questions ("Shouldn't we therefore conclude that...?")
- Questions that function as commands ("Why not try X?")

**How to fix:**
- Frame questions as genuine openings: "Can an artificial system run this loop?" is an invitation. "Don't you think we should build systems that run this loop?" is a sales pitch.
- The best questions are ones the essay then works to answer, honestly, including admitting when the answer is partial.

---

## Hard Constraints

These are non-negotiable style rules, separate from voice properties:

1. **No em-dashes** ( --- ). Use commas, parentheses, colons, or restructure the sentence.
2. **No "Not X but Y" pattern** ("Not just a tool, but a revolution"). State the point directly.

---

## How to Apply This Skill

### Step 1: Read the full draft

Read the entire post before making any changes. Understand the argument's arc, the key findings, and the narrative structure. Note which sections feel right and which feel off.

### Step 2: Section-by-section pass

Work through the draft section by section. For each section:

1. **Check the opening.** Does it lead with the point? (Property 8)
2. **Check claims.** Are they evidence-led or declarative? (Property 1)
3. **Check analogies.** Do they map structurally? (Property 5)
4. **Check sentence rhythm.** Are key claims in short sentences? (Property 3)
5. **Check tone.** Observational or prescriptive? (Property 4)
6. **Check transitions.** Callbacks or explicit cross-references? (Property 6)
7. **Check confidence level.** Measured or oversold? (Property 7)
8. **Check hard constraints.** Any em-dashes or "Not X but Y"? (Hard Constraints)

### Step 3: Concrete-first audit

After the section pass, scan the full draft for the concrete-first property (Property 2). This one is harder to catch locally because it often involves reordering paragraphs or sections. Look for any place where an abstract framework appears before the reader has encountered the thing it describes.

### Step 4: Read aloud (mentally)

Read the edited draft through once more, paying attention to rhythm and flow. The voice should feel like a knowledgeable colleague explaining something interesting they found. If any passage sounds like a textbook, a manifesto, or a sales pitch, flag it and revise.

---

## What This Skill Does Not Do

- It does not change the argument, structure, or findings of the post.
- It does not add or remove sections.
- It does not rewrite from scratch. The goal is surgical edits that shift the voice.
- It does not touch code blocks, mathematical notation, or blockquote callouts (unless the callout's prose violates voice properties).
- It does not check links, download images, or handle any non-prose concerns. Use the `blog-post-polish` skill for those.
