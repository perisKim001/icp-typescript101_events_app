import {
  Canister,
  query,
  text,
  Record,
  Vec,
  Principal,
  Result,
  Err,
  Ok,
  StableBTreeMap,
  nat64,
  Variant,
  ic,
  update,
  Opt,
} from "azle";

//user registration record

const User = Record({
  id: Principal,
  createdAt: nat64,
  username: text,
  eventsCreated: Vec(text),
});
type User = typeof User.tsType;

//events record

const Event = Record({
  id: Principal,
  eventPoster: text,
  nameOfEvent: text,
  locationOfEvent: text,
  requirements: text,
  date: text,
  createdAt: nat64,
  owner: text,
  attendance: Vec(text),
});
type Event = typeof Event.tsType;

//payload section

const EventsPayload = Record({
  eventPoster: text,
  nameOfEvent: text,
  locationOfEvent: text,
  requirements: text,
  owner: text,
  date: text,
});
const bookEventPayload = Record({
  user: text,
  eventName: text,
});
const deleteProfilePayload = Record({
  owner: text,
});
const profilePayLoad = Record({
  user: text,
});
const registerUserPayload = Record({
  username: text,
});
const upadteUserProfilePayload = Record({
  userName: text,
  newUserName: text,
});
const getEventPayload = Record({
  nameOfEvent: text,
});

//events errors

const EventsError = Variant({
  EventDoesNotExist: text,
  UserDoesNotExist: text,
  EnterCorrectDetais: text,
  EventNameIsRequired: text,
  MustBeOwner: text,
});
const deleteEventPayload = Record({
  nameOfEvent: text,
  ownerOfEvent: Principal,
  username:text
});
type EventsError = typeof EventsError.tsType;

//storages

let users = StableBTreeMap<text, User>(0);

let events = StableBTreeMap<text, Event>(1);
/**
 * create a event canister
 */
export default Canister({
  //user register to event app by passing username

  registerUser: update([registerUserPayload], text, (payload) => {
    const id = generateId();
    if (!payload.username) {
      return "username is required";
    }
    //check if username is already registerd
    const checkUserName = users.get(payload.username).Some;
    if (checkUserName) {
      return `username ${payload.username} is already taken try another one`;
    }
    const user: User = {
      id,
      createdAt: ic.time(),
      username: payload.username,
      eventsCreated: [],
    };
    users.insert(payload.username, user);
    return `${payload.username}user registered successfully`;
  }),

  //get user profile by passing username

  getUserProfile: query(
    [profilePayLoad],
    Result(Opt(User), EventsError),
    (payload) => {
      if (!payload.user) {
        return Err({
          EnterCorrectDetais: payload.user,
        });
      }
      const returnedUser = users.get(payload.user).Some;
      if (!returnedUser) {
        return Err({
          UserDoesNotExist: payload.user,
        });
      }
      return Ok(users.get(payload.user));
    }
  ),

  //user update his profile

  updateUserProfile: update([upadteUserProfilePayload], text, (payload) => {
    if (!payload.userName || !payload.newUserName) {
      return "some credentails are missing";
    }
    const checkUserName = users.get(payload.newUserName).Some;
    if (checkUserName) {
      return `username ${payload.newUserName} is already taken try another one`;
    }
    const getUser = users.get(payload.userName).Some;
    if (!getUser) {
      return `cannot update the ${payload.userName}`;
    }
    const updateUser: User = {
      ...getUser,
      username: payload.newUserName,
    };
    users.insert(payload.newUserName, updateUser);
    users.remove(payload.userName);
    return `success updated ${payload.userName} profile to ${payload.newUserName}`;
  }),
  //user delete his profile

  deleteProfile: update([deleteProfilePayload], text, (payload) => {
    const checkUser = users.get(payload.owner).Some;
    if (!checkUser) {
      return `user ${payload.owner} does not exist`;
    }
    users.remove(payload.owner);
    return `user ${payload.owner} has been deleted successfully`;
  }),

  //create an event

  createEvent: update([EventsPayload], text, (payload) => {
    if (
      !payload.eventPoster ||
      !payload.nameOfEvent ||
      !payload.locationOfEvent ||
      !payload.date ||
      !payload.requirements
    ) {
      return "Err enter correct credentials";
    }
    //check if user is already registerd
    const getUser = users.get(payload.owner).Some;
    if (!getUser) {
      return "must be registered in order to create your event";
    }
    const id = generateId();
    const event: Event = {
      id,
      eventPoster: payload.eventPoster,
      nameOfEvent: payload.nameOfEvent,
      locationOfEvent: payload.locationOfEvent,
      requirements: payload.requirements,
      date: payload.date,
      createdAt: ic.time(),
      owner: payload.owner,
      attendance: [],
    };
    events.insert(payload.nameOfEvent, event);

    //update user by adding event to events array that the user created

    const updateUserWithEvents: User = {
      ...getUser,
      eventsCreated: [...getUser.eventsCreated, event.nameOfEvent],
    };
    users.insert(payload.owner, updateUserWithEvents);

    return `${payload.nameOfEvent} event created successfully`;
  }),

  //get all events

  getAllEvents: query([], Vec(Event), () => {
    return events.values();
  }),
  //get details of an event
  getAnEventDetail: query([getEventPayload], Opt(Event), (payload) => {
    return events.get(payload.nameOfEvent);
  }),

  //delete an event

  deleteEvent: update([deleteEventPayload], text, (payload) => {
    const getEvent = events.get(payload.nameOfEvent).Some;
    if (!getEvent) {
      return `no event with ${payload.nameOfEvent} is available`;
    }
    const user=users.get(payload.username).Some;
    if(!user){
      return `give ${payload.username} is not registered`;
    }
    if (payload.ownerOfEvent.toText() === getEvent.id.toText()) {
      events.remove(payload.nameOfEvent);

      //delete event from eventcreated by user 
      
      const upadtedUser:User={
        ...user,
        eventsCreated:user.eventsCreated.filter((val)=>payload.nameOfEvent!==val)
      }
      users.insert(upadtedUser.username,upadtedUser);
      return `successfully deleted ${payload.nameOfEvent} event`;
    }

    return `unknow error ocurred`;
  }),

  //book event

  bookEvent: update([bookEventPayload], text, (payload) => {
    if (!payload.eventName || !payload.user) {
      return "event name and username are both required inorder to book";
    }
    //check if event is already exist
    const getEvent = events.get(payload.eventName).Some;
    if (!getEvent) {
      return `${payload.eventName} event is not available`;
    }
    const updateAttendanceOfEvent: Event = {
      ...getEvent,
      attendance: [...getEvent.attendance, payload.user],
    };
    events.insert(updateAttendanceOfEvent.owner, updateAttendanceOfEvent);

    return `you have successfully book ${payload.eventName}`;
  }),
  listUserEvents: query(
    [profilePayLoad],
    Result(Vec(text), EventsError),
    (payload) => {
      const user = users.get(payload.user).Some;
      if (!user) {
        return Err({
          UserDoesNotExist: `user with ${payload.user}does not exist`,
        });
      }
      return Ok(user.eventsCreated);
    }
  ),
});

//function to generate Principals ids

function generateId(): Principal {
  const randomBytes = new Array(29)
    .fill(0)
    .map((_) => Math.floor(Math.random() * 256));
  return Principal.fromUint8Array(Uint8Array.from(randomBytes));
}
