"use strict";

import { validationData } from "~~/lib/validation.js";

const authMap = {
	"bibs": {
		'191': {'b': '190', 'c': '190'},
		'600': {'a': '100', 'g': '100'},
		'610': {'a': '110', 'g': '110'},
		'611': {'a': '111', 'g': '111'},
		'630': {'a': '130', 'g': '130'},
		'650': {'a': '150'},
		'651': {'a': '151'},
		'700': {'a': '100', 'g': '100'},
		'710': {'a': '110', '9': '110'},
		'711': {'a': '111', 'g': '111'},
		'730': {'a': '130'},
		'791': {'b': '190', 'c' : '190'},
		'830': {'a': '130'},
		'991': {'a': '191', 'b': '191', 'c': '191', 'd': '191'}
	},
	"auths": {
		//'491': {'a': '191'}, # ?
		'500': {'a': '100'},
		'510': {'a': '110'},
		'511': {'a': '111'},
		'550': {'a': '150'},
		'551': {'a': '151'},
	}
};

export class Subfield {
	constructor(code, value, xref) {
		this.code = code;
		this.value = value;
		this.xref = xref;	
	}

	compile() {
		return {'code': this.code, 'value': this.value, 'xref': this.xref}
	}
}

class LinkedSubfield extends Subfield {
	constructor(code, value, xref) {
		super(code, value);
		this.xref = xref;
	}
}

export class ControlField {
	constructor(tag, value) {
		if (tag && ! tag.match(/^00/)) {throw new Error("invalid Control Field tag")}
		
		this.tag = tag;
		this.value = value;
	}
    
    validate() {}
}

export class DataField {
	constructor(tag, indicators, subfields) {
		if (tag && tag.match(/^00/)) {throw new Error("invalid Data Field tag")}
		
        this.checked = false;
        this.tag = tag;
		this.indicators = indicators || [" ", " "];
		this.subfields = subfields || [];
	}
	
	validate() {
		// lower level checks
		// these throw errors
        if (! this.subfields) {
            throw new Error("Subfield required")
        }
        
        let amap = this instanceof BibDataField ? authMap['bibs'] : authMap['auths'];
        
        for (let subfield of this.subfields) {
            if (! subfield.code) {
                throw new Error("Subfield code required")
            }
            
            if (! subfield.value || subfield.value.match(/^\s+$/)) {
                //throw new Error("Subfield value required")
				this.deleteSubfield(subfield); // this should be done somewhere else
				
				if (this.subfields.length === 0) {
					this.parentRecord.deleteField(this);
				}
            }
            
            if (this.tag in amap && subfield.code in amap[this.tag] && ! subfield.xref) {
                throw new Error("Invalid authority-controlled value")
            }
        }

		// validation rules
		let flags = [];
		let data = validationData[this.parentRecord.collection][this.tag];

		// todo: check for required indicators, subfields, values
		
		return flags
	}
    
    createSubfield(code, place) {
		let subfield = new Subfield(code);
		
        if (place) {
            this.subfields.splice(place, 0, subfield);
        }
        else {
            this.subfields.push(subfield);
        }
        
        subfield.parentField = this;
		
		return subfield;
	}
	
	getSubfields(code) {
		return this.subfields.filter(x => x.code == code);
	}
	
	getSubfield(code, place) {
		return this.getSubfields(code)[place || 0];
	}
	
	deleteSubfield(subfieldOrCode, place) {
	    if (subfieldOrCode instanceof Subfield) {
	        let subfield = subfieldOrCode;
            this.subfields = this.subfields.filter(x => x !== subfield)
	    } else {
	        let code = subfieldOrCode;
            
            if (place) {
                let subfield = this.getSubfield(code, place);
                this.deleteSubfield(subfield);
            } else {
                this.subfields = this.subfields.filter(x => x.code !== code)
            }
	    }
	}

	compile() {
		let data = {};
		
		data['tag'] = this.tag;
		data['indicators'] = this.indicators;
		data['subfields'] = this.subfields.map(x => {return {'code': x.code, 'value': x.value, 'xref': x.xref}});
		
		return data
	}
    
    toStr() {
		let str = ""
		
		for (let subfield of this.subfields) {
			str += `\$${subfield.code} ${subfield.value} `;
			
			if (subfield.xref) {
				str += `@${subfield.xref} `;
			}
			
			str += '|';
		}
		
		return str
	}
	
	lookup() {
		let collection = this instanceof BibDataField ? "bibs" : "auths";
		let lookupString = this.subfields.map(x => {return `${x.code}=${x.value}`}).join("&");
		let url = Jmarc.apiUrl + `marc/${collection}/lookup/${this.tag}?${lookupString}`;
		
		return fetch(url).then(
			response => {
				return response.json()
			}
		).then(
			json => {
				let results = json['data'];
				let choices = [];
				
				for (let auth of results) {
					// each result is a record
					// the wanted auth field is the only 1XX field
					for (let tag of Object.keys(auth).filter(x => x.match(/^1\d\d/))) {
						let field = this instanceof BibDataField ? new BibDataField(this.tag) : new AuthDataField(this.tag);
						field.indicators = auth[tag][0].indicators;
						
						for (let sf of auth[tag][0]['subfields']) {
							field.subfields.push(new Subfield(sf['code'], sf['value'], auth['_id']));
						}
						
						choices.push(field)
					}
				}
				
				return choices
			}
		)
	}
}

class BibDataField extends DataField {
	constructor(tag, indicators, subfields) {
		super(tag, indicators, subfields)
	}
}

class AuthDataField extends DataField {
	constructor(tag, indicators, subfields) {
		super(tag, indicators, subfields)
	}
}

export class Jmarc {
	constructor(collection) {
		//if (! Jmarc.apiUrl) {throw new Error("Jmarc.apiUrl must be set")};
		//Jmarc.apiUrl = Jmarc.apiUrl.slice(-1) == '/' ? Jmarc.apiUrl : Jmarc.apiUrl + '/';
		
        if (! collection) {throw new Error("Collection required")};
		this.collection = collection;
		this.recordClass = collection === "bibs" ? Bib : Auth;
		this.collectionUrl = Jmarc.apiUrl + `marc/${collection}`;
		this.recordId = null;
		this.authMap = this.collection === 'bibs' ? authMap['bibs'] : authMap['auths'];
		this.handleSetInterval=0
		this.checkUndoRedoEntry=false
		this.fields = [];
		this._history = [];
		this.undoredoIndex=0;
		this.undoredoVector=[];
	}
	
	// check if value already inside the vector
	isInsideVectorAlready(value){
		let findOccurence=false
		this.undoredoVector.forEach(element=>{
			if (JSON.stringify(element.valueEntry)===JSON.stringify(value)){
				return findOccurence=true
			}
		})
		return findOccurence
	}


	// this method will check every "myTime" if the field property of the record has changed
	startcheckingUndoRedoEntry(myTime) {

		  this.handleSetInterval=setInterval(() => {

			// if (Object.keys(this.oldJmarcValue).length === 0) {
			// 	this.oldJmarcValue = JSON.stringify(this.compile())
			// 	this.addUndoredoEntry()
			// } 
			
			if (this.undoredoVector.length === 0) {
				this.addUndoredoEntry()
			} 
			
			else if (this.isInsideVectorAlready(this.compile())===false){
					this.addUndoredoEntry()
					console.log("change(s) on : " + this.recordId)
					console.log("id context: " + this.handleSetInterval)
				}
		
		  	else if (this.isInsideVectorAlready(this.compile())===true){
				console.log("no change on :" + this.recordId)
				console.log("id context: " + this.handleSetInterval)
			}

			console.log(" number of entries : " + this.undoredoVector.length)
			
		  }, myTime);
		
	}

	stopcheckingUndoRedoEntry() {
		clearInterval(this.handleSetInterval)
	}

	// add a new undoredoEntry
	// this method should be add each time we are changing the value of one input
	addUndoredoEntry(){

		// collecting the values to assign
		let today = new Date();
		let dateEntry = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()
		let recordIdEntry=this.recordId
		let timeEntry = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
		let valueEntry={}
		valueEntry=this.compile()

		// defining the undoredoEntry Object
		let undoredoEntry= {}
		 
		// adding the properties
		undoredoEntry.dateEntry=dateEntry
		undoredoEntry.timeEntry=timeEntry
		undoredoEntry.recordIdEntry=recordIdEntry
		undoredoEntry.valueEntry=valueEntry
		
		// adding the entry inside the vector
		this.undoredoVector.push(undoredoEntry)

		// reset the index to the last value
		this.undoredoIndex=this.undoredoVector.length-1

	}

	// clear the undoredo Vector
	clearUndoredoVector(){
		this.undoredoVector=[]
	}

	// move undoredoIndex f
	// direction can be
	// undo : right from left
	// redo : left from right
	
	moveUndoredoIndexUndo(){
		
		if (this.undoredoVector.length>0) {	
				if (this.undoredoIndex===0){
						alert("this is the first entry!!!!")
					}
				if (this.undoredoIndex>0){
					
					if (this.undoredoIndex>0){
						this.undoredoIndex=this.undoredoIndex-1
					}
					//this.fields=[]
					this.parse(this.undoredoVector[this.undoredoIndex].valueEntry)
				}
			}
		if (this.undoredoVector.length===0) {
			alert("No changes detected!!!!")
		}
	}

	moveUndoredoIndexRedo(){
	
	if (this.undoredoVector.length>0) {	
			if (this.undoredoIndex==this.undoredoVector.length-1){
					alert("this is the last entry!!!!")
				}		
			if (this.undoredoIndex<this.undoredoVector.length){

				
				if (this.undoredoIndex<this.undoredoVector.length-1){
						this.undoredoIndex=this.undoredoIndex+1
				}	
				//this.fields=[]
				this.parse(this.undoredoVector[this.undoredoIndex].valueEntry)
			}
		}
		if (this.undoredoVector.length===0)  {
			alert("No changes detected!!!!")
		}
	}  
	

	isAuthorityControlled(tag, code) {
		let map = authMap;
		
		if (map[this.collection][tag] && map[this.collection][tag][code]) {
			return true
		}
		
		return false
	}

	updateSavedState() {
		this.savedState = this.compile();
				
		this.getDataFields().forEach(x => {
			x.savedState = x.compile();
			x.subfields.forEach(y => {y.savedState = y.compile()});
		});
	}
	
	async get(collection, recordId) {
		if (! Jmarc.apiUrl) {throw new Error("Jmarc.apiUrl must be set")};
		Jmarc.apiUrl = Jmarc.apiUrl.slice(-1) == '/' ? Jmarc.apiUrl : Jmarc.apiUrl + '/';
		
        if (! collection) {throw new Error("Collection required")}
		let jmarc = new Jmarc(collection);
        
        if (! recordId) {throw new Error("Record ID required")}
		jmarc.recordId = parseInt(recordId);
		jmarc.url = Jmarc.apiUrl + `marc/${collection}/records/${recordId}`;
		
		let savedResponse;
		
		return fetch(jmarc.url).then(
			response => {
				savedResponse = response;
				
				return response.json()
			}
		).then(
			json => {
				if (savedResponse.status === 404) {
					// record not found
					return 
				} else if (savedResponse.status != 200) {
					throw new Error(json['message'])
				}
				
				jmarc.parse(json['data']);  
				jmarc.updateSavedState();

				jmarc.files = json['data']['files']
				
				return jmarc
			}
		).catch(
			error => {throw error}
		)
	}
	
	static async listWorkforms(collection) {
	    let response = await fetch(Jmarc.apiUrl + `marc/${collection}/workforms`);
        let json = await response.json();
        
        return json.data.map(
            url => url.split("/").slice(-1)[0]
        );
	}
    
    static async workforms(collection) {
	    let workforms = []
        
        for (let name of await Jmarc.listWorkforms(collection)) {
            workforms.push(await Jmarc.fromWorkform(collection, name))
        }
        
        return workforms
    }
    
    static fromWorkform(collection, workformName) {
        let jmarc = new Workform(collection);
        
        return fetch(jmarc.collectionUrl + '/workforms/' + workformName).then(
            response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`Workform "${workformName}" not found`);
                }
            }
        ).then(
            json => {
                jmarc.parse(json.data);
                jmarc.workformName = workformName;
                jmarc.workformDescription = json.data.description;

                return jmarc;
            }
        )
	}
    
    static deleteWorkform(collection, workformName) {
        return fetch(
            Jmarc.apiUrl + `marc/${collection}/workforms/${workformName}`,
            { method: 'DELETE' }
        ).then(
            response => response.json()
        ).then(
            json => {
                return true
            }
        )
    }

    async saveWorkform(workformName, description) {
        let data = this.compile();
        data.name = workformName;
        data.description = description;
        delete data["_id"];

        await fetch(
            `${this.collectionUrl}/workforms/${encodeURIComponent(workformName)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        ).then(response => {
            if (response.ok) {
                return true;
            }
        }).catch(json => {
            throw new Error(json['message']);
        });
    }
    
    async saveAsWorkform(workformName, description) {
        let data = this.compile()
        data['name'] = workformName;
        data['description'] = description;
        delete data['_id'];
        
        let error = false;
        
        const response = await fetch(
            this.collectionUrl + '/workforms',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        if (!response.ok) {
            error = true;
        }
        const json = await response.json();
        if (error === true) {
            throw new Error(json['message']);
        }
        return true;
    }
    
    post() {
		if (this.recordId) {
			return Promise.reject("Can't POST existing record")
		}
        
        try {
            this.validate();
		} catch (error) {
		    return Promise.reject(error)
		}
        
		let savedResponse;

		return fetch(
			this.collectionUrl + '/records',
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: this.stringify()
			}	
		).then(
			response => {
                savedResponse = response;
                
				return response.json()
			}
		).then(
			json => {
				if (savedResponse.status != 201) {
					throw new Error(json['message']);
				}
				
				this.url = json['result'];
				this.recordId = parseInt(this.url.split('/').slice(-1));
				this.updateSavedState();
				
				return this;
			}
		).catch(
		    error => { throw new Error(error) }
		)
	}

	put() {
		if (! this.recordId) {
			return Promise.reject("Can't PUT new record")
		}
        
        try {
            this.validate();
		} catch (error) {
		    return Promise.reject(error)
		}
		
		let savedResponse;

		return fetch(
			this.url,
			{
				method: 'PUT',
				headers: {'Content-Type': 'application/json'},
				body: this.stringify()
			}	
		).then(
			response => {
				savedResponse = response;

				return response.json();
			}
		).then(
			json => {
				if (savedResponse.status != 200) {
					throw new Error(json['message'])
				}
				
				this.updateSavedState();

				return this;
			} 
		).catch(
			 error => { throw new Error(error) }
		)
	}
	
	delete() {
		if (! this.recordId) {
			throw new Error("Can't DELETE new record")
		}
		
		let savedResponse;
		
		return fetch(
			this.url,
			{method: 'DELETE'}	
		).then(
			response => {
				if (response.status == 204) {
					this.recordId = null;
					this.url = null;
				
					return this;
				}
				
				return response.json()
			}
		)
        .then(
			check => {
				if (check instanceof Jmarc) {
					return check
				}
				
				throw new Error(`Something went wrong: ${check}`)
			}
		).catch(
			error => { throw new Error(error) }
		)
	}

	get saved() {
		return JSON.stringify(this.savedState) === JSON.stringify(this.compile());
	}

	parse(data={}) {
		this.updated = data['updated'];
		this.user = data['user'];
		//this.fields = [];
		
		let tags = Object.keys(data).filter(x => x.match(/^\d{3}/));
		tags = tags.sort((a, b) => parseInt(a) - parseInt(b));
		
		// update the existing objects if the new data exists in this record in order to preserve saved state
		for (let tag of tags) {
			for (let [i, field] of data[tag].entries()) {
				let newField = this.getField(tag, i) || this.createField(tag);
				newField._seen = true;
				
				if (tag.match(/^00/)) {
                    newField.value = field;
                } else {
                    newField.indicators = field.indicators.map(x => x.replace(" ", "_"));
					let seen = {}; // for keeping the subfield order
					
					for (let subfield of field.subfields) {
						let newSub = newField.getSubfield(subfield.code, seen[subfield.code]) || newField.createSubfield(subfield.code);
						newSub._seen = true; // temp flag used for differentiating previous state
						newSub.value = subfield.value;
                        newSub.xref = subfield.xref;
						if (! seen[subfield.code]) seen[subfield.code] = 0;
						seen[subfield.code]++;
					}
				}
			}
		}

		// remove existing data not in new data
		for (let field of this.getDataFields()) {
			if (! field._seen) {
				this.deleteField(field);
				continue
			}

			delete field._seen;

			for (let subfield of field.subfields) {
				if (! subfield._seen) {
					field.deleteSubfield(subfield);
				}

				delete subfield._seen;
			}
		}
		
		return this		
	}
	
	compile() {
		let recordData = {_id: this.recordId, updated: this.updated, user: this.user};
		let tags = Array.from(new Set(this.fields.map(x => x.tag)));

		for (let tag of tags.sort(x => parseInt(x))) {
			recordData[tag] = recordData[tag] || [];
			
			for (let field of this.getFields(tag)) {
				if (field.constructor.name == 'ControlField') {
					recordData[tag].push(field.value);
				} else {
					recordData[tag].push(field.compile());
				}
			}
		}

		return recordData
	}
	
	stringify() {
		return JSON.stringify(this.compile())
	}
	
	async history() {
		if (typeof this.url === "undefined") {
			return []
		}
		
		let response = await fetch(this.url + "/history");
		let json = await response.json();
		let data = json['data'];
		let historyRecords = [];
		
		for (let result of data) {
			let record = new Jmarc(this.collection);
			let response = await fetch(result.event);
			let json = await response.json();
			record.parse(json['data']);
			historyRecords.push(record);
		}
		
		return historyRecords
	}

	diff(other) {
		// returns a new Jmarc record where the fields different from "other" are tagged
		if (! other instanceof Jmarc) {throw new Error("First argument must be instance of Jmarc")};

		let diff = new Diff(this.collection);
		diff.parse(this.compile());

		for (let field of diff.fields) {
			if (other.fields.map(x => x.toStr()).includes(field.toStr())) {
				field.isDiff = false
			} else {
				field.isDiff = true
			}
		}

		return diff
	}

	clone() {
		let cloned = (new this.recordClass).parse(this.compile());
		
        cloned.deleteField("001");
		cloned.deleteField("005");
		cloned.deleteField("008");
        cloned.deleteField("035");
		cloned.deleteField("981");
		cloned.deleteField("989");
        cloned.deleteField("998");
        //cloned.deleteField("999");
        //cloned.createField("999").createSubfield("a").value = "";
        
        if (this.recordClass === Auth) {
            return cloned
        }
        
        for (let field of cloned.getFields("029")) {
            if (field.getSubfield("b")) {
                field.getSubfield("b").value = "" 
            } else {
                field.createSubfield("b").value = ""
            }
        }
		
		return cloned
	}
	
	createField(tag, place) {
        let field;
		
		if (tag && tag.match(/^00/)) {
			field = new ControlField(tag)
		} else {
			if (this.collection === "bibs") {
				field = new BibDataField(tag)
			} else if (this.collection === "auths") {
				field = new AuthDataField(tag)
			} else {
			    // other record types?
			}
		}
        
        if (field.tag && place) {
            // field place
            let i = 0;
            let found = false;
            
            for (let [c, f] of Object.entries(this.fields)) {
                if (f.tag === field.tag) {
                    if (i === place) {
                        this.fields.splice(c, 0, field);
                        found = true;
                    }
                              
                    i++;
                }
            }
            
            if (! found) {
				// put at end of tag group
                this.fields.splice(
					this.fields.indexOf(this.getField(field.tag)) + this.getFields(field.tag).length, 
					0, 
					field
				);

				console.log(this.fields.map(x => x.tag))
            }
        } else if (place) {
            // record place
            this.fields.splice(place, 0, field);
        } else {
            this.fields.push(field);
        }
        
        field.parentRecord = this;
		
		return field
	}
	
	getControlFields() {
		return this.fields.filter(x => x.tag.match(/^0{2}/))
	}
	
	getDataFields() {
		return this.fields.filter(x => ! x.tag.match(/^0{2}/))
	}
	

	getFields(tag) {
		return this.fields.filter(x => x.tag == tag)
	}
	
	getField(tag, place) {
		return this.getFields(tag)[place || 0]
	}
	
	deleteField(tagOrField, place) {
		if (tagOrField instanceof DataField) {
            let field = tagOrField;
		    this.fields = this.fields.filter(x => x !== field);
		} else {
            let tag = tagOrField;
            
            if (place) {
			    let field = this.getField(tag, place);
			    this.deleteField(field);
		    } else {
			    // delete all instances of tag
			    this.fields = this.fields.filter(field => field.tag !== tag);
		    }
	    }
    }
    
	getSubfield(tag, code, tagPlace, codePlace) {
		let field = this.getField(tag, tagPlace);
		
		if (field) {
			return field.getSubfield(code, codePlace);
		}
		
		return
	}

    validate() {
		// lower level checks
        for (let field of this.fields) {
            if (! field.tag) {
                throw new Error("Tag required")
            }
            
            if (! field.tag.match(/\d{3}/) ) {
                throw new Error("Invalid tag")
            }
            
            field.validate()
            
            if (this.collection == "auths") {
                if (! this.fields.map(x => x.tag.substring(0, 1)).includes("1")) {
                    throw new Error("Heading field required")
                }
            }
        }

		// validation rules
		let flags = [];
		let data = validationData[this.collection];

		// todo: check for required fields

		return flags
    }

	async authHeadingInUse() {
		if (this.collection !== "auths") return

		let headingField = (this.fields.filter(x => x.tag.match(/^1/)) || [null])[0];

		if (! headingField) return

		let searchStr = 
    	    headingField.subfields
    	    .map(x => `${headingField.tag}__${x.code}:'${x.value}'`)
    	    .join(" AND ");

    	let url = Jmarc.apiUrl + "/marc/auths/records/count?search=" + searchStr;

    	// wait for the result
    	let inUse = await fetch(url)
    	    .then(response => {
    	        return response.json()
    	    }).then(json => {
    	        let count = json.data;
    	        return count ? true : false
    	    }).catch(error => {
    	        throw error
    	    })

		return inUse ? true : false
	}
}

export class Bib extends Jmarc {
	constructor() {
		super("bibs");
	}
	
	static get(recordId) {
		return Jmarc.get("bibs", recordId)
	}
	
    clone() {
        return super.clone();
    }
    
	validate() {
        super.validate();
    }
}

export class Auth extends Jmarc {
	constructor() {
		super("auths");
	}
			
	static get(recordId) {
		return Jmarc.get("auths", recordId)
	}
	
    clone() {
        return super.clone()
    }
    
	validate() {
        super.validate();
    }
}

export class Workform extends Jmarc {
	// work in progress
    
    constructor(collection, name=null) {
		super(collection);
	}
}

export class Diff extends Jmarc {
	// work in progress
    
	constructor(collection) {
		super(collection);
	}
}