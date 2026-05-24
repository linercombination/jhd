# Earphone Tangling in a Pocket: Revised Project Plan (English Authoritative Version)

This English document is the authoritative version for the project. The Chinese document is a faithful counterpart written from this version.

Related engineering document:

- [earphone_tangling_engineering_plan_en.md](./earphone_tangling_engineering_plan_en.md)

## 1. Research Positioning

### 1.1 Core question

We do not model the system as an ideal single open string anymore. Instead, we model a **Y-shaped branched semiflexible cable with rigid endcaps and a rigid Y-junction** moving inside a confined pocket-like environment. The main scientific question is:

How do cable geometry, stiffness, rigid hardware, and pocket agitation affect the formation, persistence, and severity of earphone tangling?

### 1.2 Why this reformulation is necessary

A wired earphone is not a simple linear chain:

- It has a **branch point**.
- It has **three open ends** in the geometric sense of the cable graph, but one branch is usually terminated by the plug and the other two by earbuds.
- Several parts are **mechanically rigid**, especially the plug housing, earbud housings, and the Y-junction splitter.

Therefore, the problem is better framed as the dynamics of a **branched confined cable** rather than classical knotting of a single open chain. This point is important because strict knot invariants are naturally defined for closed loops, while the earphone is an open branched object. For this reason, our primary observables should be **threading, loop capture, and tangling severity**, not only strict topological knots [1,2,7-9].

## 2. Physical System Definition

### 2.1 Geometry of the earphone

We represent the earphone as a graph with one junction node and three arms:

- `trunk arm`: plug to Y-junction, contour length `L_0`
- `left arm`: Y-junction to left earbud, contour length `L_1`
- `right arm`: Y-junction to right earbud, contour length `L_2`

In the symmetric case adopted in this project:

```text
L_1 = L_2
```

We will use the following convention throughout the report:

```text
L_total = L_0 + L_1
```

Here, `L_total` means the **single-side path length** from the plug to either earbud. The actual cable material length is therefore:

```text
L_mat = L_0 + L_1 + L_2 = L_0 + 2L_1
```

This convention matches the intuitive way people often describe an earphone cable in daily life. At the same time, keeping `L_mat` explicit avoids ambiguity in the scientific description.

Example:

- if the lower segment is `L_0 = 0.7 m` and the single-side total length is `L_total = 1.0 m`, then `L_1 = L_2 = 0.3 m`
- the corresponding material length is `L_mat = 1.3 m`

For later extensions, we can still relax the symmetry assumption and allow `L_1 != L_2`.

### 2.2 Rigid components

The following components are treated as rigid or quasi-rigid bodies:

- plug housing
- left earbud housing
- right earbud housing
- Y-junction splitter

These components should have:

- larger effective radius than the flexible cable
- stronger steric exclusion
- larger local bending resistance near their attachment points

This choice is physically motivated because real tangling often becomes problematic when a rigid part passes through a loop and gets trapped.

## 3. Coarse-Grained Model

### 3.1 Recommended representation

We recommend a **branched discrete worm-like chain** model with excluded volume:

- The cable is discretized into beads connected by bonds of equilibrium length `b`.
- The three arms share one junction bead or a short rigid junction unit.
- Flexible cable sections are modeled by ordinary beads.
- Plug and earbuds are modeled by larger-radius terminal beads or short rigid bead clusters.

This combines three standard ideas:

- **worm-like chain / persistence length** for semiflexibility [3,4]
- **self-avoidance / excluded volume** for impenetrability [5]
- **branched or star-polymer-style coarse graining** for the Y-shape [6]

### 3.2 Beginner-friendly interpretation

For a beginner, the model can be understood in a very simple way:

- the earphone cable is cut into many short pieces
- each short piece is represented by a small bead
- neighboring beads stay connected, so the cable does not break
- the chain can bend, but sharp bending is penalized
- different parts of the cable cannot pass through each other
- the plug, earbuds, and Y-junction are represented by larger and stiffer beads

So, in plain language, this is a **bead-chain model for a Y-shaped cable**. It is related to polymer bead-spring models, but it is not the simplest random-walk chain. A simple random walk would allow unrestricted turning and self-crossing, whereas our model includes:

- self-avoidance
- bending stiffness
- branching
- rigid hardware
- confinement inside a pocket

Therefore, the closest beginner-level description is:

**a coarse-grained bead-chain model of a confined self-avoiding semiflexible Y-shaped cable**

### 3.3 Energy terms

The total potential energy can be written schematically as

```text
U = U_bond + U_bend + U_excl + U_wall + U_hardware
```

where:

- `U_bond`: keeps neighboring beads at approximately fixed spacing
- `U_bend`: penalizes sharp bending and sets the persistence length
- `U_excl`: prevents self-crossing and overlapping beads
- `U_wall`: confines the cable inside the pocket
- `U_hardware`: optional extra terms for rigid-body geometry and local stiffness near the plug, earbuds, and junction

Practical choices:

- `U_bond`: harmonic spring or nearly inextensible bond
- `U_bend`: discrete worm-like chain bending penalty, e.g. proportional to `1 - cos(theta)`
- `U_excl`: short-range repulsive potential or hard-core rejection
- `U_wall`: repulsive wall potential or reflecting boundary

### 3.4 Why this model is scientifically appropriate

This is not an atomistic simulation of polymer chemistry. It is a **coarse-grained soft-matter model** aimed at mesoscopic geometry and entanglement statistics. That level of description is appropriate for a course project because the key observables depend mainly on:

- contour geometry
- bending stiffness
- self-avoidance
- confinement
- non-equilibrium agitation

rather than on atomic-scale electronic structure.

## 4. Dynamics and Pocket Environment

### 4.1 Recommended dynamics

For this project, the main dynamical model should be **overdamped Langevin-style dynamics** rather than pure Monte Carlo reconfiguration:

```text
gamma * d r_i / dt = -grad_i(U) + xi_i(t) + f_i^agitation(t)
```

where:

- `gamma` is the effective friction
- `-grad_i(U)` is the deterministic force from the coarse-grained model
- `xi_i(t)` is stochastic noise
- `f_i^agitation(t)` is an externally imposed pocket-like driving force

### 4.2 Why not use pure Monte Carlo as the main model

Monte Carlo pivot or crankshaft moves are very useful for equilibrium conformational sampling, but they do not produce a visually intuitive physical trajectory. Since this project explicitly requires:

- modeling the tangling **process**
- making time-dependent **visualization**
- discussing the effect of the **environment**

Langevin-style dynamics is a better main framework. Monte Carlo can still be kept as a comparison tool or as a simplified baseline.

In the current engineering implementation, this is realized as a **force-based overdamped update with soft bond, bending, excluded-volume, and wall-repulsion terms**, plus colored-agitation and random forcing. It is therefore closer to a mesoscopic Langevin proxy than to a fully rigorous molecular-dynamics integrator.

### 4.3 Pocket environment model

We model the pocket as a confined volume with optional internal obstacles.

Minimum environment:

- a rectangular pocket box with dimensions `W`, `H`, and `T`
- reflecting or repulsive walls
- isotropic random agitation

More realistic environment:

- colored noise instead of white noise
- periodic compression in one direction
- intermittent shear-like forcing
- gravity direction changes or body-motion-inspired forcing

Optional extension:

- a rigid phone-shaped obstacle
- one or more key-like obstacles

### 4.4 Tunable parameters

The main simulation parameters should be grouped as follows.

Geometry:

- `L_0`, `L_1`, `L_2`
- cable diameter `d_cable`
- hardware radii `r_plug`, `r_earbud`, `r_junction`
- discretization length `b`

Mechanics:

- bending stiffness `k_bend` or persistence length `l_p`
- local stiffness near hardware
- effective friction `gamma`

Environment:

- pocket dimensions `W`, `H`, `T`
- agitation amplitude `A`
- agitation correlation time `tau_a`
- compression amplitude and frequency
- obstacle presence and obstacle size

Initialization:

- initial folded shape
- initial orientation
- whether the earbuds start close together or separated

## 5. How to Define and Quantify Tangling

### 5.1 Conceptual position

For this Y-shaped open branched system, **strict knot type is not the best primary observable**. The main practical question is not "does the object realize a classical closed knot invariant," but rather:

- does a rigid part become trapped by a loop
- how many nonlocal contacts are formed
- how persistent are these contacts
- how difficult is the structure to undo

Therefore, we define a hierarchy of observables.

### 5.2 Primary observable: threading or loop-capture events

The most physically meaningful primary observable is **threading**:

- a loop is formed by a sufficiently large portion of cable
- a rigid terminal component or another arm passes through that loop
- the resulting configuration persists for longer than a minimum time threshold

This observable is much closer to everyday earphone tangling than a strict knot label.

Suggested event definition:

1. detect a candidate loop from nonlocal near-closure of cable segments
2. determine whether a rigid component or another arm crosses the loop surface
3. require persistence over a minimum time window `t_min`

This gives a binary or integer-valued threading count:

```text
N_thread = number of active loop-capture events
```

In the current version of the demo, the event detector is implemented as a **loop-capture proxy** rather than a rigorous loop-surface crossing algorithm:

1. detect candidate loops by nonlocal near-closure of distant contour locations
2. approximate the loop using a small triangle or local loop region
3. mark a threading-like event when a rigid terminal component enters that region
4. keep only events that persist for at least a small number of sampled frames

This is a scientifically weaker but still explainable version of the intended observable, and it should be described honestly as a proxy rather than a strict topological classifier.

### 5.3 Secondary observable: nonlocal contact count

Define `N_contact` as the number of bead pairs or segment pairs satisfying:

- spatial distance below a cutoff `r_c`
- contour separation above a threshold `s_c`

This measures geometric crowding and entanglement density. It is easy to compute and easy to visualize.

### 5.4 Secondary observable: contact persistence

Short accidental touches should not be treated the same as stable tangles. Therefore, we define:

- `T_persist`: cumulative lifetime of nonlocal contacts or threading events

This distinguishes transient collisions from persistent entanglement.

In the current demo implementation, the persistence contribution is implemented more narrowly as a **contact-persistence proxy**:

- repeated nonlocal contact pairs are tracked from frame to frame
- only contact pairs that persist for at least a small number of sampled frames contribute
- the reported summary value is therefore closer to an average persistence score for repeated nonlocal contacts than to a full contact-plus-threading lifetime integral

### 5.5 Secondary observable: untangling cost

We define a practical "difficulty to untangle" metric:

- start from a given tangled state
- switch off active agitation
- relax the system under mild biased disentangling dynamics or controlled pulling
- measure the time or number of steps required to return to a low-tangle state

This yields:

- `C_untangle`: untangling cost

### 5.6 Composite tangling score

A project-level scalar metric can be defined as

```text
S_tangle = w1 * N_thread + w2 * N_contact + w3 * T_persist + w4 * C_untangle
```

with positive weights `w1-w4`.

This score is not a fundamental invariant. It is a **physically interpretable engineering metric** for the severity of tangling in daily use.

In the current demo implementation, `S_tangle` is still a simplified engineering score based on:

- active persistent loop-capture proxy events
- nonlocal contact count
- a simple nonlocal-contact persistence contribution

The explicit `C_untangle` term is not implemented yet and should be treated as future work.

### 5.7 Advanced topological analysis as an optional extension

If we later want a more topological analysis, two extensions are possible:

- **open-chain closure / stochastic closure** for open subchains [7]
- **knotoid-based analysis** for open curves without explicit closure [8]

For branched or bonded structures, the relevant mathematical language becomes even richer and may connect to **bonded knotoids** and **theta-curve topology** [8,9]. This is scientifically interesting, but it should be treated as an extension rather than the main deliverable for the course project.

## 6. Visualization Plan

The project should include both process-level and summary-level visualization.

### 6.1 Process visualization

- 3D animation of the earphone inside the pocket
- distinct colors for the trunk arm, left arm, and right arm
- larger rendered spheres or capsules for plug, earbuds, and junction
- highlighted contacts and detected loop-capture proxy events

### 6.2 Diagnostic visualization

- time series of `N_thread`, `N_contact`, and `S_tangle`
- contact map between contour indices
- snapshots at key events: pre-loop, threading, trapped state, untangling

### 6.3 Statistical visualization

- heat map of average `S_tangle` versus stiffness and agitation
- line plots of threading probability versus `L_0/L_total`
- bar plots comparing different pocket geometries
- phase-style diagram showing regimes such as `loose`, `contact-rich`, and `threaded`

## 7. Minimal Deliverable for the Course Project

To keep the project feasible, the first complete version should contain:

1. a 3D coarse-grained Y-shaped cable model
2. overdamped force-based Langevin-style dynamics in a rectangular pocket
3. rigid hardware beads for plug, earbuds, and junction
4. automatic detection of persistent loop-capture proxy events and nonlocal contacts
5. one animation and a small parameter scan

Recommended first parameter scan:

- `L_0 / L_total`
- stiffness `k_bend` or persistence length `l_p`
- agitation amplitude `A`
- pocket thickness `T`

This is already enough for a scientifically coherent presentation.

## 8. Risks, Boundaries, and How to State Them

The report should explicitly state the following limitations.

- The model is **coarse-grained**, not atomistic.
- The main observable is **tangling severity / threading proxy events**, not a strict classical knot invariant.
- The agitation is an **effective non-equilibrium model** of pocket motion, not a detailed biomechanical reconstruction of human walking.
- Quantitative agreement with a specific real earphone is not the immediate goal; the main goal is to identify **qualitative trends and parameter dependence**.

These statements do not weaken the project. They make the scope scientifically honest and much more defensible.

## 9. References

[1] Raymer, D. M.; Smith, D. E. Spontaneous Knotting of an Agitated String. *Proc. Natl. Acad. Sci. U.S.A.* **2007**, *104* (42), 16432-16437. https://doi.org/10.1073/pnas.0611320104

[2] Gendron, I.; Savard, K.; Capaldi, X.; Liu, Z.; Zeng, L.; Reisner, W.; Capaldi, L. Time-Dependent Knotting of Agitated Chains. *Phys. Rev. E* **2021**, *103*, 032501. https://doi.org/10.1103/PhysRevE.103.032501

[3] Kratky, O.; Porod, G. Rontgenuntersuchung geloster Fadenmolekule. *Recueil des Travaux Chimiques des Pays-Bas* **1949**, *68* (12), 1106-1122. https://doi.org/10.1002/recl.19490681203

[4] Baschnagel, J.; Meyer, H.; Wittmer, J.; Kulic, I.; Mohrbach, H.; Ziebert, F.; Nam, G.-M.; Lee, N.-K.; Johner, A. Semiflexible Chains at Surfaces: Worm-Like Chains and beyond. *Polymers* **2016**, *8* (8), 286. https://doi.org/10.3390/polym8080286

[5] Madras, N.; Slade, G. *The Self-Avoiding Walk*; Modern Birkhauser Classics; Springer: New York, 2013. https://doi.org/10.1007/978-1-4614-6025-1

[6] Halun, J.; Karbowniczek, P.; Kuterba, P.; Danel, Z. Investigation of Ring and Star Polymers in Confined Geometries: Theory and Simulations. *Entropy* **2021**, *23* (2), 242. https://doi.org/10.3390/e23020242

[7] Virnau, P.; Mirny, L. A.; Kardar, M. Intricate Knots in Proteins: Function and Evolution. *PLoS Comput. Biol.* **2006**, *2* (9), e122. https://doi.org/10.1371/journal.pcbi.0020122

[8] Goundaroulis, D.; Gugumcu, N.; Lambropoulou, S.; Dorier, J.; Stasiak, A.; Kauffman, L. H. Topological Models for Open-Knotted Protein Chains Using the Concepts of Knotoids and Bonded Knotoids. *Polymers* **2017**, *9* (9), 444. https://doi.org/10.3390/polym9090444

[9] Dabrowski-Tumanski, P.; Goundaroulis, D.; Stasiak, A.; Rawdon, E. J.; Sulkowska, J. I. Theta-Curves in Proteins. *Protein Sci.* **2024**, *33* (9), e5133. https://doi.org/10.1002/pro.5133
