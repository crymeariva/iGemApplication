# MOSMAGE Overview
MOSMAGE (Modular Open Source Automated Genome Engineering) is a platform focused around modular hardware and open source software to accomplish biological experimentation. Users design workflow cycles as node graphs on a canvas and execute hardware instructions

# Workflow Concepts
- Cycles/Workflow: A saved worklow consisting of name + node(s) + edge(s), these are stored in the database.
- Node: A hardware unit on the canvas. Nodes connect via edges to define workflow order.
- Canvas: The React Flow workspace where cycles are built.

# Hardware Nodes (Exactly 5)
## Peristaltic Pump (peristalticPump)
Moves fluid through tubing via rotating rollers. A hardcoded amount of steps with selectable movement (right/left), up/down movement of pump, which board (1-4) and axis (X, Y, Z, A) on respective board.

## Syringe Pump (syringePump)
Precise volumetric dispensing. Allows users to adjust how many 'steps' for dispensing, up/down movement of pump, which board (1-4) and axis (X, Y, Z, A) on respective board.

## Thermometer (thermometer)
Temperature monitoring/setting.

## Spectrometer (spectrometer)
Optical measurement for analysis.

## Electroporator (electroporator)
Applies controlled electrical pulses. Determined by the rate at which the syringe pump pushes the fluid out.
