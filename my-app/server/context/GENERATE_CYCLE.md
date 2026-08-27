# Lab workflow notes

Reference material for AI cycle generation (loaded by the generate-cycle agent path).
This file captures MOSMAGE-relevant lab talk and how it maps to canvas nodes.

## Hardware → node types
- Use ONLY: peristalticPump, syringePump, thermometer, spectrometer, electroporator
- **Bulk / continuous fluid move, media transfer, flush, wash lines, feed culture** → peristalticPump
- **Precise dispense, aliquot, dose DNA/reagent into cuvette or tube** → syringePump
- **Incubate, hold temp, heat-shock temp, grow at N°C** → thermometer
- **OD, optical density, absorbance, growth check, measure culture** → spectrometer
- **Electroporate, transform, transformation, pulse/shock cells** → electroporator
- Electroporation in MOSMAGE is driven by syringe push → default transform path is **syringePump → electroporator**

## Node labels (required)
- Always use these exact labels — never rename nodes for the protocol:
  - peristalticPump → "Peristaltic Pump"
  - syringePump → "Syringe Pump"
  - thermometer → "Thermometer"
  - spectrometer → "Spectrometer"
  - electroporator → "Electroporator"

## Node settings
- syringePump / peristalticPump: steps, boardVal (1-4), axis (X|Y|Z|A), direction (up|down|left|right)
- thermometer: temperature
- spectrometer / electroporator: often `{}` until device settings are defined
- Only fill settings the user explicitly stated; do not invent defaults

## Cycle name
- Optional. Prefer a brief summary over a fancy cycle title; the UI does not auto-save under the generated name.

## Named recipes (lab lingo → node order)

### Transfer / dosing
- "media transfer", "transfer media", "feed culture", "flush the line", "wash the tubing"
  → peristalticPump
- "aliquot", "dispense", "dose", "precise volume", "load the cuvette"
  → syringePump

### Temperature
- "incubate", "hold at temperature", "grow at 37", "heat shock", "temperature hold"
  → thermometer
  (include temperature only if they stated a number)

### Measurement
- "OD check", "check OD", "optical density", "absorbance", "growth check", "measure the culture"
  → spectrometer
- "aliquot then OD" / "sample then measure"
  → syringePump → spectrometer
- "transfer then OD"
  → peristalticPump → spectrometer

### Transformation / electroporation
- "electroporate", "electroporation", "transform", "transformation"
  → syringePump → electroporator
- "dispense into cuvette and electroporate"
  → syringePump → electroporator

### Combined protocols
- "grow and check OD" / "incubate then OD"
  → thermometer → spectrometer
- "transfer, incubate, then OD"
  → peristalticPump → thermometer → spectrometer
- "prep for transformation" / "ready cells then transform"
  → thermometer → syringePump → electroporator
- "OD then transform" / "check density then electroporate"
  → spectrometer → syringePump → electroporator
- "full transform workflow" / "transfer, OD, then electroporate"
  → peristalticPump → spectrometer → syringePump → electroporator

## Example JSON shape (future generate endpoint)

```json
{
  "name": "Transformation",
  "summary": "Syringe dispense into the electroporator for transformation.",
  "nodes": [
    {
      "id": "n1",
      "type": "syringePump",
      "data": { "label": "Syringe Pump", "settings": {} }
    },
    {
      "id": "n2",
      "type": "electroporator",
      "data": { "label": "Electroporator", "settings": {} }
    }
  ],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2" }]
}
```

## Example — incubate then OD

User: "incubate at 37 then check OD"

```json
{
  "name": "Incubate then OD",
  "summary": "Hold at 37°C, then measure optical density.",
  "nodes": [
    {
      "id": "n1",
      "type": "thermometer",
      "data": { "label": "Thermometer", "settings": { "temperature": "37" } }
    },
    {
      "id": "n2",
      "type": "spectrometer",
      "data": { "label": "Spectrometer", "settings": {} }
    }
  ],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2" }]
}
```

## Open questions / to refine with lab
- Spectrometer settings (mode, wavelength/OD600, blank) once the device UI is defined
- Default syringe steps/board/axis for transformation, if the lab has a standard
- Whether “flush the line” should always be peristaltic-only or include a volume/time
