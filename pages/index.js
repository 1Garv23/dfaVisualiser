import { useState } from 'react';
import Graph from "react-graph-vis";
import { v4 as uuidv4 } from "uuid";
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import React from 'react';

const options = {
  layout: { hierarchical: false },
  edges: { color: "#ABABAB" },
  nodes: { color: "#BBBBBB" },
  physics: { enabled: false },
  interaction: { multiselect: false, dragView: false }
};

const defaultGraph = {
  nodes: [{ id: 1, label: "q0", title: null }],
  edges: []
};


const automataInput = {
  "q": [
    "q0",
    "q2",
    "q3",
    "q4"
  ],
  "sigma": [
    "0",
    "1",
    ""
  ],
  "delta": {
    "q0": {
      "0": [
        "q2",
        "q3",
        "q4"
      ],
      "1": "q4",
      "": "q4"
    },
    "q2": {
      "1": [
        "q2",
        "q3",
        "q4"
      ]
    },
    "q3": {},
    "q4": {
      "1": [
        "q2",
        "q0"
      ]
    }
  },
  "initial_state": "q0",
  "f": [
    "q4"
  ]
};


// Call the function with the input after 1 second


export default function Home() {
  const [graphData, setGraphData] = useState(defaultGraph);
  const [fromState, setFromState] = useState(1);
  const [toState, setToState] = useState(1);
  const [inputString, setInputString] = useState('');
  const [transitionSymbol, setTransitionSymbol] = useState('0');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [regex, setRegex] = useState('');

  // Automata data structure
  const [automata, setAutomata] = useState({
    q: ['q0'],
    sigma: ['0', '1',''],
    delta: { 'q0': {} },
    initial_state: 'q0',
    f: []
  });

  const addNewState = (accepting) => {
    const newId = Math.max(...graphData.nodes.map(n => n.id)) + 1;
    const newState = `q${newId}`;
    
    setGraphData(prev => ({
      nodes: [...prev.nodes, { 
        id: newId, 
        label: newState,
        ...(accepting && { borderWidth: 3, color: { border: '#000000' }, title: 'accepting' })
      }],
      edges: prev.edges
    }));

    setAutomata(prev => ({
      ...prev,
      q: [...prev.q, newState],
      delta: { ...prev.delta, [newState]: {} },
      ...(accepting && { f: [...prev.f, newState] })
    }));
  };

  const addTransition = () => {
    const symbol=transitionSymbol;
    if(transitionSymbol==""){
      symbol='ε';

    }
    const sourceNode = graphData.nodes.find(n => n.id === fromState);
    const targetNode = graphData.nodes.find(n => n.id === toState);
    // Update graph visualization
    setGraphData(prev => {
      const existingEdge = prev.edges.find(e => 
        e.from === fromState && e.to === toState
      );
      
      if (existingEdge) {
        
        return {
          ...prev,
          edges: prev.edges.map(e => 
            e === existingEdge ? {
              ...e,
              label: [...new Set([...e.label.split(', '), symbol])].join(', ')
            } : e
          )
        };
      }
      return {
        ...prev,
        edges: [...prev.edges, {
          from: fromState,
          to: toState,
          label: symbol,
          smooth: { enabled: true, type: 'curvedCW', roundness: 1 }
        }]
      };
    });

    // Update automata data structure
    setAutomata(prev => {
      const newDelta = { ...prev.delta };
      const transitions = newDelta[sourceNode.label][transitionSymbol] || [];
      
      newDelta[sourceNode.label] = {
        ...newDelta[sourceNode.label],
        [transitionSymbol]: [...new Set([...transitions, targetNode.label])]
      };
      
      return { ...prev, delta: newDelta };
    });
  };


  const consAuto = (automatonData) => {
    if (typeof automatonData === 'string') {
      automatonData = JSON.parse(automatonData);
    }
  
    // 1. Create state map and node list
    const stateMap = {};
    let nodeId = 1;
    
    // Initialize with initial state
    const initialState = automatonData.initial_state || 'q0';
    const nodes = [{
      id: nodeId,
      label: initialState,
      ...(automatonData.f.includes(initialState) && { 
        borderWidth: 3, 
        color: { border: '#000000' }, 
        title: 'accepting' 
      })
    }];
    stateMap[initialState] = nodeId++;
  
    // 2. Create all nodes first
    automatonData.q.forEach(state => {
      if (state !== initialState) {
        nodes.push({
          id: nodeId,
          label: state,
          ...(automatonData.f.includes(state) && { 
            borderWidth: 3, 
            color: { border: '#000000' }, 
            title: 'accepting' 
          })
        });
        stateMap[state] = nodeId++;
      }
    });
  
    // 3. Create transitions
    const edges = [];
    Object.entries(automatonData.delta).forEach(([fromState, transitions]) => {
      Object.entries(transitions).forEach(([symbol, toStates]) => {
        const targets = Array.isArray(toStates) ? toStates : [toStates];
        targets.forEach(toState => {
          edges.push({
            from: stateMap[fromState],
            to: stateMap[toState],
            label: symbol === '' ? 'ε' : symbol,
            smooth: { enabled: true, type: 'curvedCW', roundness: 1 }
          });
        });
      });
    });
  
    // 4. Update state in one batch
    setGraphData({ nodes, edges });
    setAutomata({
      q: automatonData.q,
      sigma: automatonData.sigma,
      delta: automatonData.delta,
      initial_state: initialState,
      f: automatonData.f
    });
  };
  

  // Function to call /dfa2nfa endpoint
  const handleConversion = async (inputData) => {
    console.log("Input Data:", JSON.stringify(inputData, null, 2));
    try {
      const response = await fetch('http://localhost:8000/nfa2dfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error converting DFA to NFA');
      }

      const data = await response.json();
      setResult(data);
      console.log(data);
      consAuto(data);
      setError(null); // Clear previous errors
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  // Function to call /minimize endpoint
  const handleMinimization = async (inputData) => {
    console.log("Input Data:", JSON.stringify(inputData, null, 2));
    try {
      const response = await fetch('http://localhost:8000/minimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error minimizing automaton');
      }

      const data = await response.json();
      setResult(data);
      console.log(data);
      consAuto(data);
      setError(null); // Clear previous errors
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };


  const exportAutomata = () => {
    const data = {
      ...automata,
      delta: Object.fromEntries(
        Object.entries(automata.delta).map(([state, transitions]) => [
          state,
          Object.fromEntries(
            Object.entries(transitions).map(([symbol, states]) => [
              symbol,
              states.length === 1 ? states[0] : states
            ])
          )
        ])
      )
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'automata.json';
    link.click();
  };

  const checkString = () => {
    const requestData = {
      ...automata,
      delta: Object.fromEntries(
        Object.entries(automata.delta).map(([state, transitions]) => [
          state,
          Object.fromEntries(
            Object.entries(transitions).map(([symbol, states]) => [
              symbol,
              states.length === 1 ? states[0] : states
            ])
          )
        ])
      ),
      string: inputString
    };
  
    checkAcceptance(requestData)
      .catch(error => {
        alert(`Error: ${error.message}`);
      });
  };
  
  async function checkAcceptance(requestData) {
    try {
      const response = await fetch('http://localhost:8000/check-acceptance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData), // Fixed JSON stringification
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        
        // Handle FastAPI validation errors (422) and custom errors
        let errorMessage;
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => e.msg).join(', ');
        } else {
          errorMessage = errorData.detail || JSON.stringify(errorData);
        }
        
        throw new Error(errorMessage);
      }
  
      const responseData = await response.json();
      
      if (responseData.accepted) {
        alert('✅ The string is ACCEPTED!');
      } else {
        alert('❌ The string is REJECTED');
      }
      
      return responseData;
    } catch (error) {
      console.error('Error in checkAcceptance:', error);
      alert(`Error: ${error.message}`);
      throw error;
    }
  }
  
  async function handleConvertRegexToDFA() {
    try {
      const response = await fetch('http://localhost:8000/regex-to-enfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regex }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage;
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => e.msg).join(', ');
        } else {
          errorMessage = errorData.detail || JSON.stringify(errorData);
        }
        throw new Error(errorMessage);
      }

      // Pass the JSON data directly to consAuto
      const data = await response.json();
      consAuto(data);

      alert('✅ DFA created successfully!');
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }

  const returnCurr=()=>{
    return ({
      ...automata,
      delta: Object.fromEntries(
        Object.entries(automata.delta).map(([state, transitions]) => [
          state,
          Object.fromEntries(
            Object.entries(transitions).map(([symbol, states]) => [
              symbol,
              states.length === 1 ? states[0] : states
            ])
          )
        ])
      )
    });
  };

  
  return (
    <div className={styles.container}>
      <Head>
        <title>ε-NFA Visualizer</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 style={{ textAlign: 'center', color: '#333' }}>ε-NFA Visualizer</h1>

        <div style={{ width: '80vw', margin: '0 auto', padding: '20px' }}>
          <div className="controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '10px' }}>
            <button onClick={() => consAuto(automataInput)}>try</button>
            <button onClick={() => handleConversion(returnCurr())}>Convert NFA to DFA</button>
            <button onClick={()=>{handleMinimization(returnCurr())}}>Minimize Automaton</button>
            <button style={{ padding: '10px', cursor: 'pointer', backgroundColor:'#658CBB' }} onClick={() => addNewState(false)}>
              Add State
            </button>
            <button style={{ padding: '10px', cursor: 'pointer', backgroundColor:'#658CBB' }} onClick={() => addNewState(true)}>
              Add Accepting State
            </button>
            <button style={{ padding: '10px', cursor: 'pointer', backgroundColor:'#658CBB' }} onClick={exportAutomata}>
              Export automata.json
            </button>
            </div>
            <div className="transition-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select style={{ padding: '5px' }} value={fromState} onChange={e => setFromState(+e.target.value)}>
                {graphData.nodes.map(node => (
                  <option key={node.id} value={node.id}>{node.label}</option>
                ))}
              </select>
              
              <input 
                type="text"
                value={transitionSymbol}
                onChange={e => setTransitionSymbol(e.target.value)}
                placeholder="Symbol"
                style={{ width: '60px', textAlign: 'center' }}
              />
              
              <select style={{ padding: '5px' }} value={toState} onChange={e => setToState(+e.target.value)}>
                {graphData.nodes.map(node => (
                  <option key={node.id} value={node.id}>{node.label}</option>
                ))}
              </select>
              
              <button style={{ padding: '10px', cursor: 'pointer' }} onClick={addTransition}>
                Add Transition
              </button>
            </div>

            <div className="input-test" style={{ marginTop: '10px' }}>
              <input
                type="text"
                value={inputString}
                onChange={e => setInputString(e.target.value.replace(/[^01]/g, ''))}
                placeholder="Enter test string"
                style={{ padding: '5px', width: '150px' }}
              />
              <button style={{ padding: '10px', cursor: 'pointer', marginLeft: '5px' }} onClick={checkString}>
                Test String
              </button>
            </div>
            <div>
      <input
        type="text"
        value={regex}
        onChange={e => setRegex(e.target.value)}
        placeholder="Enter regular expression"
      />
      <button onClick={handleConvertRegexToDFA}>
        Convert to DFA
      </button>
    </div>
          </div>

          <div className="graph-container" style={{ marginTop: '20px', border: '1px solid #ccc', borderRadius: '5px' }}>
            <Graph
              graph={graphData}
              options={options}
              key={JSON.stringify(graphData)}
              style={{ height: "500px", width: "100%" }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
