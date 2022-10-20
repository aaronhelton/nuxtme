<template>
    <div>
        <div class="container">
            <span>{{collection}}/{{id}}</span>
        </div>
    </div>
</template>
<script>
import { Jmarc } from "~~/lib/jmarc.mjs"
export default {
    props: {
        collection: {
            type: String,
            required: true
        },
        id: {
            type: String,
            required: true
        }
    },
    data () {
        return {
            readOnly: true,
            jmarc: {}
        }
    },
    created: async function () {
        const config = useAppConfig()
        const jmarc = new Jmarc(this.collection)
        Jmarc.apiUrl = config.apiUrl
        jmarc.get(this.collection, this.id).then ( j => this.jmarc = j)
    },
    methods: {
        showInput(e, value) {
            console.log(e)
            e.target.setAttribute("contenteditable", true)
        }
    }
}
</script>
