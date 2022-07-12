interface Event {
    arguments:unknown,
    identity:unknown,
    info:any
}

export const handler = async (event:Event) => {
    try {
        console.log('event: ', event)
        return 'you called an endpoint! Congrats'
    } catch (error){
        console.log("error: ", error)
        return error;
    }  
}