from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from automathon import DFA, NFA
from typing import Dict, Any
from collections import deque

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AutomatonRequest(BaseModel):
    q: list
    sigma: list
    delta: Dict[str, Dict[str, Any]]
    initial_state: str
    f: list

class RegexRequest(BaseModel):
    regex: str

class State:
    def __init__(self):
        self.transitions = {}
        self.is_final = False

class NFAFragment:
    def __init__(self, start, end):
        self.start = start
        self.end = end
        self.end.is_final = True

class RegexToENFA:
    def __init__(self, regex):
        self.regex = regex
        self.stack = []
        self.state_count = 0
        self.alphabet = set()

    def new_state(self):
        self.state_count += 1
        return State()

    def tokenize(self):
        tokens = []
        prev_type = None
        for c in self.regex:
            current_type = None
            if c in '+*()':
                current_type = c
            elif c == '.':
                current_type = '.'
            else:
                current_type = 'char'

            if prev_type in ['char', ')', '*'] and current_type in ['char', '(']:
                tokens.append('.')
            
            if c != '.' or current_type == '.':
                tokens.append(c)
            
            prev_type = 'char' if current_type == 'char' else c
        return tokens

    def infix_to_postfix(self, tokens):
        precedence = {'+': 2, '.': 3, '*': 4, '(': 1}
        output = []
        op_stack = []
        
        for token in tokens:
            if token == '(':
                op_stack.append(token)
            elif token == ')':
                while op_stack[-1] != '(':
                    output.append(op_stack.pop())
                op_stack.pop()
            elif token in precedence:
                while op_stack and precedence.get(op_stack[-1], 0) >= precedence[token]:
                    output.append(op_stack.pop())
                op_stack.append(token)
            else:
                output.append(token)
        
        while op_stack:
            output.append(op_stack.pop())
            
        return output

    def build(self):
        tokens = self.tokenize()
        postfix = self.infix_to_postfix(tokens)
        
        for token in postfix:
            if token == '.':
                self.handle_concat()
            elif token == '+':
                self.handle_union()
            elif token == '*':
                self.handle_kleene_star()
            else:
                self.handle_char(token)
        
        if len(self.stack) != 1:
            raise ValueError("Invalid regular expression")
        
        return self.stack.pop()

    def handle_char(self, c):
        s1 = self.new_state()
        s2 = self.new_state()
        s1.transitions[c] = [s2]
        self.alphabet.add(c)
        self.stack.append(NFAFragment(s1, s2))

    def handle_concat(self):
        frag2 = self.stack.pop()
        frag1 = self.stack.pop()
        frag1.end.is_final = False
        frag1.end.transitions[''] = [frag2.start]
        self.stack.append(NFAFragment(frag1.start, frag2.end))

    def handle_union(self):
        frag2 = self.stack.pop()
        frag1 = self.stack.pop()
        start = self.new_state()
        end = self.new_state()
        
        start.transitions[''] = [frag1.start, frag2.start]
        frag1.end.transitions[''] = [end]
        frag2.end.transitions[''] = [end]
        frag1.end.is_final = False
        frag2.end.is_final = False
        
        self.stack.append(NFAFragment(start, end))

    def handle_kleene_star(self):
        frag = self.stack.pop()
        start = self.new_state()
        end = self.new_state()
        
        start.transitions[''] = [frag.start, end]
        frag.end.transitions[''] = [frag.start, end]
        frag.end.is_final = False
        
        self.stack.append(NFAFragment(start, end))

def nfa_to_json(nfa_fragment, alphabet):
    state_map = {}
    q = deque([nfa_fragment.start])
    states = []
    
    while q:
        state = q.popleft()
        if state not in state_map:
            state_id = f"q{len(state_map)}"
            state_map[state] = state_id
            states.append(state)
            for targets in state.transitions.values():
                for t in targets:
                    if t not in state_map:
                        q.append(t)
    
    delta = {}
    for state in states:
        state_id = state_map[state]
        delta[state_id] = {}
        for symbol, targets in state.transitions.items():
            delta[state_id][symbol if symbol else ""] = [state_map[t] for t in targets]
    
    return {
        "q": list(delta.keys()),
        "sigma": sorted(alphabet) + [""],
        "delta": delta,
        "initial_state": state_map[nfa_fragment.start],
        "f": [state_map[s] for s in states if s.is_final]
    }

def json_data_to_nfa(json_data: dict) -> NFA:
    states = set(json_data["q"])
    alphabet = {s for s in json_data["sigma"] if s}
    delta = {}
    for state in json_data["delta"]:
        delta[state] = {}
        for symbol, targets in json_data["delta"][state].items():
            clean_targets = [targets] if isinstance(targets, str) else targets
            delta[state][symbol] = set(clean_targets)
    initial_state = json_data["initial_state"]
    final_states = set(json_data["f"])
    return NFA(states, alphabet, delta, initial_state, final_states)

def nfa_to_response(nfa: NFA) -> dict:
    state_mapping = {state: f"q{i}" for i, state in enumerate(sorted(nfa.q))}
    return {
        "q": [state_mapping[state] for state in sorted(nfa.q)],
        "sigma": sorted(nfa.sigma) + ([""] if any("" in t for t in nfa.delta.values()) else []),
        "delta": {
            state_mapping[src]: {
                sym: (
                    state_mapping[list(tgt)[0]] 
                    if len(tgt) == 1 
                    else [state_mapping[t] for t in sorted(tgt)]
                )
                for sym, tgt in trans.items()
            }
            for src, trans in nfa.delta.items()
        },
        "initial_state": state_mapping[nfa.initial_state],
        "f": [state_mapping[state] for state in sorted(nfa.f)]
    }

@app.post("/nfa2dfa", response_model=AutomatonRequest)
async def convert_automaton(request: AutomatonRequest):
    try:
        nfa = json_data_to_nfa(request.dict())
        dfa = nfa.get_dfa()
        return nfa_to_response(dfa.get_nfa())
    except Exception as e:
        raise HTTPException(400, detail=f"Error: {str(e)}")

@app.post("/minimize", response_model=AutomatonRequest)
async def minimize_automaton(request: AutomatonRequest):
    try:
        nfa = json_data_to_nfa(request.dict())
        minimized_nfa = nfa.minimize()
        return nfa_to_response(minimized_nfa)
    except Exception as e:
        raise HTTPException(400, detail=f"Error: {str(e)}")

@app.post("/regex-to-enfa", response_model=AutomatonRequest)
async def regex_to_enfa(request: RegexRequest):
    try:
        converter = RegexToENFA(request.regex)
        enfa = converter.build()
        return nfa_to_json(enfa, converter.alphabet)
    except Exception as e:
        raise HTTPException(400, detail=f"Error: {str(e)}")
