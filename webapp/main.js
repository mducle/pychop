console.log("Initialising")

import * as Preact from 'https://esm.sh/preact'
//import * as PreactHooks from 'https://esm.sh/preact/hooks'
import { signal } from 'https://esm.sh/@preact/signals'
import htm from 'https://esm.sh/htm'
const html = htm.bind(Preact.h)

//console.log("Loaded preact and htm")

//

//import { loadPyodide } from "./assets/pyodide/pyodide.js";
import "./assets/plotly-2.27.0.min.js";
import "./assets/pyodide/pyodide.js";

//console.log("Loaded pyodide and plotly")

// Initialise python and import PyChop
let pyodide = await loadPyodide();
let pychopresponse = await fetch("./assets/pychop.tar.gz");
let pychoptar = await pychopresponse.arrayBuffer();
pyodide.unpackArchive(pychoptar, "gztar");
for (const pkg of ["numpy", "pyyaml"]) {
  await pyodide.loadPackage(pkg);
}

const pychop = pyodide.pyimport("PyChop");
//console.log("Loaded pychop")

// Loads instruments from files, we must do this in Python because
// the Emscripten virtual file system is not accessible from JS
const instruments = pyodide.runPython(`
  import PyChop
  from PyChop.Instruments import Instrument
  from os import path, listdir
  folder = path.dirname(PyChop.__file__)
  [Instrument(path.join(folder, f)) for f in listdir(folder) if f.endswith('.yaml')]
`);

console.log("Loaded instruments")

// Parses instruments into JS arrays to construct the preact UI
let instnames = [], instindx = {}, reps = [];
let choppers = [], maxfreqs = [], deffreqs = [], frqnames = [], phases = [];
let idx = 0;
for (const inst of instruments) {
  //console.log(inst.name)
  instnames.push(inst.name)
  instindx[inst.name] = idx;
  idx = idx + 1;
  choppers.push(inst.getChopperNames().toJs())
  reps.push(inst.chopper_system.source_rep)
  maxfreqs.push(inst.chopper_system.max_frequencies.toJs())
  deffreqs.push(inst.chopper_system.default_frequencies.toJs())
  if (maxfreqs.slice(-1)[0].length > 1) {
    frqnames.push(inst.chopper_system.frequency_names.toJs())
  } else {
    frqnames.push(["Frequency"])
  }
  if (inst.chopper_system.isPhaseIndependent.length > 0) {
    phases.push({id:inst.chopper_system.isPhaseIndependent.toJs(),
                 name:inst.chopper_system.phaseNames.toJs(),
                 def:inst.chopper_system.defaultPhase.toJs()})
  } else {
    phases.push([])
  }
}

/*
console.log(instnames)
console.log(choppers)
console.log(reps)
console.log(maxfreqs)
console.log(frqnames)
console.log(deffreqs)
console.log(phases)

const instnames = [ "ARCS", "CNCS", "HYSPEC", "LET", "MAPS", "MARI", "MERLIN", "SEQUOIA" ]
const instindx = { ARCS: 0, CNCS: 1, HYSPEC: 2, LET: 3, MAPS: 4, MARI:5, MERLIN:6, SEQUOIA: 7 }
const choppers = [ [ "ARCS-100-1.5-AST", "ARCS-100-1.5-SMI", "ARCS-700-0.5-AST", "ARCS-700-1.5-AST", "ARCS-700-1.5-SMI", "SEQ-100-2.0-AST", "SEQ-700-3.5-AST" ],
  [ "High Flux", "High Resolution", "Intermediate" ],
  [ "OnlyOne" ],
  [ "High Flux", "High Resolution", "Intermediate" ],
  [ "A", "B", "S" ],
  [ "A", "B", "C", "G", "R", "S" ],
  [ "G", "S" ],
  [ "ARCS-100-1.5-AST", "ARCS-100-1.5-SMI", "ARCS-700-0.5-AST", "ARCS-700-1.5-AST", "ARCS-700-1.5-SMI", "Fine", "SEQ-100-2.0-AST", "SEQ-700-3.5-AST", "Sloppy" ]
]
const reps = [ 60, 60, 60, 10, 50, 50, 50, 60 ]
const maxfreqs = [ [ 600 ], [ 300, 300 ], [ 420 ], [ 300, 300 ], [ 600, 100 ], [ 600 ], [ 600 ], [ 600 ] ]
const frqnames = [ [ "Frequency" ], [ "Resolution disk frequency", "Fermi frequency" ], [ "Frequency" ],
[ "Resolution frequency", "Pulse remover frequency" ], [ "Fermi frequency", "Disk frequency" ], [ "Frequency" ], [ "Frequency" ], [ "Frequency" ] ]
const deffreqs = [ [300], [300, 60], [180], [240, 120], [400, 50], [400], [400], [300] ]
const phases = [ [], [], [], { "id": [ 1 ], "name": [ "Chopper 2 phase delay time" ], "def": [ 5 ] }, { "id": [ 0 ], "name": [ "Multirep mode number" ], "def": [ "1" ] }, { "id": [ 0 ], "name": [ "Disk chopper slot index" ], "def": [ "0" ] }, { "id": [ 0 ], "name": [ "Disk chopper phase delay time" ], "def": [ 1500 ] }, [] ]
*/

// Defines the signals which hold current state values for calculation
const curr_inst = signal(instnames[0]);
const curr_chopper = signal(choppers[0][0]);
const curr_freq = signal(deffreqs[0]);
const curr_ei = signal(0);
const curr_phase = signal([])

// Defines Preact GUI components
class PyChopFreqSingle extends Preact.Component {
  state = { freq: deffreqs[this.props.instid][this.props.id] }
  freqs = Array(maxfreqs[0][0] / reps[0] + 1).fill().map((_, idx) => idx * reps[0])
  freqchange = (ev) => {
    this.setState({ freq: ev.target.value })
    curr_freq.value[this.props.id] = Number(ev.target.value)
  }
  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.instid != this.props.instid) {
      const nfrq = maxfreqs[nextProps.instid][nextProps.id] / reps[nextProps.instid] + 1
      this.freqs = Array(nfrq).fill().map((_, idx) => idx * reps[nextProps.instid])
      this.setState({ freq: deffreqs[nextProps.instid][nextProps.id] })
      return true
    }
    return (nextState.freq != this.state.freq)
  }
  render({ instid, id }, { freq }) {
    //console.log("Rendering PyChopFreqSingle")
    return html`
      <p>${frqnames[instid][id]}</p>
      <select value=${freq} id="${frqnames[instid][id]}" onChange=${this.freqchange}>
      ${this.freqs.map(frq => html`
        <option value="${frq}">${frq}</option>
      `)}
      </select>
    `
  }
}

class PyChopFrequencies extends Preact.Component {
  shouldComponentUpdate(nextProps, nextState) {
    return (nextProps.inst != this.props.inst)
  }
  render({ inst }, _) {
    const idx = instindx[inst]
    //console.log("Rendering PyChopFrequencies for inst index " + idx)
    let vdom = []
    for (let i = 0; i < frqnames[idx].length; i++) {
      vdom.push(Preact.h(PyChopFreqSingle, { instid: idx, id: i }, null))
    }
    return vdom
  }
}

class PyChopPhaseSingle extends Preact.Component {
  phasechange = (ev) => {
    //console.log("Callback of phase " + this.props.id + " with value " + ev.target.value)
    curr_phase.value[this.props.id] = Number(ev.target.value)
  }
  render({ instid, id }, _) {
    return html`
      <p>${phases[instid].name[id]}</p>
      <input name="PyChopPhase${id}" style="width:80%;" onChange=${this.phasechange}
        value="${phases[instid].def[id]}" />
    `
  }
}

class PyChopPhases extends Preact.Component {
  shouldComponentUpdate(nextProps, nextState) {
    return (nextProps.inst != this.props.inst)
  }
  render({ inst }, _) {
    const idx = instindx[inst]
    if (phases[idx].length != 0) {
      //console.log("Rendering PyChopPhases")
      curr_phase.value = phases[idx].def
      let vdom = []
      for (let i = 0; i < phases[idx].id.length; i++) {
        vdom.push(Preact.h(PyChopPhaseSingle, { instid: idx, id: i }, null))
      }
      return vdom
    } else {
      curr_phase.value = []
    }
  }
}

class PyChopChoppers extends Preact.Component {
  state = { chopper: choppers[0][0] }
  chopchange = (ev) => {
    this.setState({ chopper: ev.target.value })
    curr_chopper.value = ev.target.value
  }
  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.inst != this.props.inst) {
      this.setState({ chopper: choppers[instindx[nextProps.inst]][0] })
      return true
    }
    return (nextState.chopper != this.state.chopper)
  }
  render({ inst }, { chopper }) {
    //console.log("Rendering PyChopChoppers")
    return html`
      <p>Chopper</p>
      <select value=${chopper} id="PyChopChopper" name="Chopper" onChange=${this.chopchange}>
      ${choppers[instindx[inst]].map(chp => html`
        <option value="${chp}">${chp}</option>
      `)}
      </select>
      <${PyChopFrequencies} inst=${inst} />
      <${PyChopPhases} inst=${inst} />
    `
  }
}

class PyChopInstrument extends Preact.Component {
  state = { inst: instnames[0] }
  instchange = (ev) => {
    this.setState({ inst: ev.target.value })
    curr_inst.value = ev.target.value
    curr_chopper.value = choppers[instindx[curr_inst.value]][0]
    curr_freq.value = deffreqs[instindx[curr_inst.value]]
  }
  eichange = (ev) => {
    curr_ei.value = Number(ev.target.value)
    //runCalc()
  }
  render(_, { inst }) {
    //console.log("Rendering PyChopInstrument")
    return html`
      <p>Instrument</p>
      <select value=${inst} id="PyChopInstrument" name="Instruments" onChange=${this.instchange}>
      ${instnames.map(instname => html`
        <option value="${instname}">${instname}</option>
      `)}
      </select>
      <${PyChopChoppers} inst=${inst} />
      <p>Ei</p>
      <input name="Ei" style="width:80%;" onChange=${this.eichange} />
      <p></p>
      <button onClick=${runCalc}>Calculate and Plot</button>
      <div>
        <input type="checkbox" id="hold_checkbox" name="hold_checkbox" />
        <label for="hold_checkbox" style="font-size:14px">Hold Current Plot</label>
      </div>
      <div>
        <input type="checkbox" id="multirep_checkbox" name="multirep_checkbox" />
        <label for="multirep_checkbox" style="font-size:14px">Show Multi-Reps</label>
      </div>
    `
  }
}

// Render the control panel using preact+htm
const panel = document.getElementById("ControlPanel")
Preact.render(html`<${PyChopInstrument} />`, panel)

// Defines the layout of the different graphs
const p0 = {x:[0], y:[0]}
const lgl = {x:1, y:1, xanchor:'right'}
const rsp = {responsive: true}
//const p2l = {grid: {rows:1, columns:2, pattern:'independent'}, legend:lgl,
//  yaxis: {title: 'Flux (n/cm²/s)'}, yaxis2: {title: 'Elastic Resolution FWHM (meV)'} }
const flxstr = 'Flux (n/cm²/s)', elstr = 'Elastic Resolution FWHM (meV)';
const eistr = 'Incident Energy (meV)', chstr = 'Chopper Frequency (Hz)', qstr = '|Q| (Å⁻¹)';
const restab = document.getElementById("ResolutionPlot")
const reslayout = {xaxis: {title: 'Energy Transfer (meV)'}, yaxis: {title: 'ΔE (meV FWHM)'}, legend:lgl}
Plotly.newPlot(restab, [p0], reslayout, rsp)
const fluxei = document.getElementById("FluxEiPlot")
//const fluxeilayout = {...p2l, ...{xaxis: {title: eistr}, xaxis2: {title: eistr}}}
//Plotly.newPlot(fluxei, [p0, {...p0, ...{xaxis:'x2', yaxis:'y2'}}], fluxeilayout, {responsive: true})
//const fluxfreq = document.getElementById("FluxFreqPlot")
//const fluxfreqlayout = {...p2l, ...{xaxis: {title: chstr}, xaxis2: {title: chstr}}}
//Plotly.newPlot(fluxfreq, [p0, {...p0, ...{xaxis:'x2', yaxis:'y2'}}], fluxfreqlayout, {responsive: true})
const fleila = {xaxis: {title: eistr}, yaxis: {title: flxstr}, legend:lgl}
Plotly.newPlot(fluxei, [p0], fleila, rsp)
const resei = document.getElementById("ResEiPlot")
const reeila = {xaxis: {title: eistr}, yaxis: {title: elstr}, legend:lgl}
Plotly.newPlot(resei, [p0], reeila, rsp)
const fluxfreq = document.getElementById("FluxFreqPlot")
const flfqla = {xaxis: {title: chstr}, yaxis: {title: flxstr}, legend:lgl}
Plotly.newPlot(fluxfreq, [p0], flfqla, rsp)
const resfreq = document.getElementById("ResFreqPlot")
const refqla = {xaxis: {title: chstr}, yaxis: {title: elstr}, legend:lgl}
Plotly.newPlot(resfreq, [p0], refqla, rsp)

// Helper functions
function linspace(start, stop, num, endpoint = true) {
  const div = endpoint ? (num - 1) : num;
  const step = (stop - start) / div;
  return Array.from({length: num}, (_, i) => start + step * i);
}
let d_ei = {inst:'None', chop:'None', freq:0}
let d_fq = {inst:'None', chop:'None', ei:0}

// Runs the PyChop calculations and plots the data 
function runCalc() {
  console.log(curr_inst.value + " " + curr_chopper.value + " " + curr_freq.value +
    " " + curr_ei.value + " " + curr_phase.value)
  const hold_cb = document.getElementById("hold_checkbox")
  const multirep_cb = document.getElementById("multirep_checkbox")
  const is_hold = hold_cb.checked, is_multirep = multirep_cb.checked
  const instid = instindx[curr_inst.value], inst = instruments[instid]
  inst.setChopper(curr_chopper.value, curr_freq.value)
  inst.setEi(curr_ei.value)
  if (!is_hold) {
    if (restab.data.length > 0) {
      Plotly.deleteTraces(restab, Array(restab.data.length).fill(1).map((_,i) => i))
      // For some reason deleteTraces doesn't work properly for Flux-Ei and Flux-Freqs graphs...
    }
  }
  const labinst = curr_inst.value + '_' + curr_chopper.value + '_'
  const labei = labinst + curr_ei.value + 'meV_'
  const labfreq = labinst + curr_freq.value + 'Hz_'
  if (is_multirep) {
    const eis = inst.getAllowedEi().toJs()
    const en = linspace(0, 0.95, 200)
    const res = inst.getMultiRepResolution(en).toJs()
    const flux = inst.getMultiRepFlux().toJs().map((v) => Number(v).toFixed(0))
    for (let i = 0; i < eis.length; i++) {
      Plotly.addTraces(restab, [{x:linspace(0, 0.95*eis[i], 200), y:res[i], type:'scatter',
                                 name:labfreq + eis[i] + 'meV_' + flux[i] + 'n/cm2/s'}])
    }
  } else {
    const en = linspace(0, 0.95*curr_ei.value, 200)
    const res = inst.getResolution(en).toJs()
    const flux = Number(inst.getFlux().toJs()).toFixed(0)
    Plotly.addTraces(restab, [{x:en, y:res, type:'scatter', 
                               name:labfreq + curr_ei.value + 'meV_' + flux + 'n/cm2/s'}])
  }
  if (curr_inst.value != d_ei.inst || curr_chopper.value != d_ei.chop || curr_freq.value[0] != d_ei.freq) {
    //console.log('Calculating Ei-dep')
    let flux = [], elres = [];
    const eis = linspace(Math.max(inst.emin, 0.1), inst.emax, 25)
    for (const ei of eis) {
      flux.push(Number(inst.getFlux(ei).toJs()))
      elres.push(Number(inst.getResolution(0.0, ei).toJs()))
    }
    //Plotly.addTraces(fluxei, [{x:eis, y:flux, name:labfreq}, {x:eis, y:elres, xaxis:'x2', yaxis:'y2'}])
    if (is_hold) {
      Plotly.addTraces(fluxei, [{x:eis, y:flux, type:'scatter', name:labfreq}])
      Plotly.addTraces(resei, [{x:eis, y:elres, type:'scatter', name:labfreq}])
    } else {
      Plotly.react(fluxei, [{x:eis, y:flux, type:'scatter', name:labfreq}], fleila)
      Plotly.react(resei, [{x:eis, y:elres, type:'scatter', name:labfreq}], reeila)
    }
    d_ei = {inst:curr_inst.value, chop:curr_chopper.value, freq:curr_freq.value[0]}
  }
  if (curr_inst.value != d_fq.inst || curr_chopper.value != d_fq.chop || curr_ei.value != d_fq.ei) {
    //console.log('Calculating Freq-dep')
    let flux = [], elres = [];
    const fqs = Array(maxfreqs[instid][0] / reps[instid] + 1).fill().map((_, idx) => idx * reps[instid])
    for (const freq of fqs) {
      inst.setFrequency([freq].concat(curr_freq.value.slice(1)))
      flux.push(Number(inst.getFlux(curr_ei.value).toJs()))
      elres.push(Number(inst.getResolution(0.0, curr_ei.value).toJs()))
    }
    //Plotly.addTraces(fluxfreq, [{x:fqs, y:flux, name:labei}, {x:fqs, y:elres, xaxis:'x2', yaxis:'y2'}])
    if (is_hold) {
      Plotly.addTraces(fluxfreq, [{x:fqs, y:flux, type:'scatter', name:labei}])
      Plotly.addTraces(resfreq, [{x:fqs, y:elres, type:'scatter', name:labei}])
    } else {
      Plotly.react(fluxfreq, [{x:fqs, y:flux, type:'scatter', name:labei}], flfqla)
      Plotly.react(resfreq, [{x:fqs, y:elres, type:'scatter', name:labei}], refqla)
    }
    d_fq = {inst:curr_inst.value, chop:curr_chopper.value, ei:curr_ei.value}
  }
}

