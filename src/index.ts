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

// User registration record
const User = Record({
  id: Principal,
  createdAt: nat64,
  username: text,
  eventsCreated: Vec(text),
});
type User = typeof User.tsType;

// Event record
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

// Payloads
const EventsPayload = Record({
  eventPoster: text,
  nameOfEvent: text,
  locationOfEvent: text,
  requirements: text,
  owner: text,
  date: text,
});
const BookEventPayload = Record({
  user: text,
  eventName: text,
});
const DeleteProfilePayload = Record({
  owner: text,
});
const ProfilePayload = Record({
  user: text,
});
const RegisterUserPayload = Record({
  username: text,
});
const UpdateUserProfilePayload = Record({
  userName: text,
  newUserName: text,
});
const GetEventPayload = Record({
  nameOfEvent: text,
});
const DeleteEventPayload = Record({
  nameOfEvent: text,
  ownerOfEvent: Principal,
});

// Events errors
const EventsError = Variant({
  EventDoesNotExist: text,
  UserDoesNotExist: text,
  InvalidDetails: text,
  EventNameIsRequired: text,
  MustBeOwner: text,
});
type EventsError = typeof EventsError.tsType;

// Storage
let users = StableBTreeMap<text, User>(0);
let events = StableBTreeMap<text, Event>(1);

/**
 * Create an event canister
 */
export default Canister({
  // Register user
  registerUser: update([RegisterUserPayload], Result(text, EventsError), (payload) => {
    const id = generateId();
    if (!payload.username) {
      return Err({ InvalidDetails: "Username is required" });
    }
    // Check if username is already taken
    const checkUserName = users.get(payload.username);
    if (checkUserName.isSome()) {
      return Err({ InvalidDetails: `Username ${payload.username} is already taken` });
    }
    const user: User = {
      id,
      createdAt: ic.time(),
      username: payload.username,
      eventsCreated: [],
    };
    users.insert(payload.username, user);
    return Ok(`${payload.username} registered successfully`);
  }),

  // Get user profile
  getUserProfile: query(
    [ProfilePayload],
    Result(Opt(User), EventsError),
    (payload) => {
      if (!payload.user) {
        return Err({ InvalidDetails: "Username is required" });
      }
      const returnedUser = users.get(payload.user);
      if (!returnedUser.isSome()) {
        return Err({ UserDoesNotExist: `User ${payload.user} does not exist` });
      }
      return Ok(returnedUser);
    }
  ),

  // Update user profile
  updateUserProfile: update([UpdateUserProfilePayload], Result(text, EventsError), (payload) => {
    if (!payload.userName || !payload.newUserName) {
      return Err({ InvalidDetails: "Both current and new usernames are required" });
    }
    const checkNewUserName = users.get(payload.newUserName);
    if (checkNewUserName.isSome()) {
      return Err({ InvalidDetails: `Username ${payload.newUserName} is already taken` });
    }
    const getUser = users.get(payload.userName);
    if (!getUser.isSome()) {
      return Err({ UserDoesNotExist: `User ${payload.userName} does not exist` });
    }
    const updateUser: User = {
      ...getUser.unwrap(),
      username: payload.newUserName,
    };
    users.insert(payload.newUserName, updateUser);
    users.remove(payload.userName);
    return Ok(`Successfully updated profile to ${payload.newUserName}`);
  }),

  // Delete user profile
  deleteProfile: update([DeleteProfilePayload], Result(text, EventsError), (payload) => {
    const checkUser = users.get(payload.owner);
    if (!checkUser.isSome()) {
      return Err({ UserDoesNotExist: `User ${payload.owner} does not exist` });
    }
    users.remove(payload.owner);
    return Ok(`User ${payload.owner} has been deleted successfully`);
  }),

  // Create event
  createEvent: update([EventsPayload], Result(text, EventsError), (payload) => {
    if (
      !payload.eventPoster ||
      !payload.nameOfEvent ||
      !payload.locationOfEvent ||
      !payload.date ||
      !payload.requirements
    ) {
      return Err({ InvalidDetails: "All event details are required" });
    }
    // Check if user is registered
    const getUser = users.get(payload.owner);
    if (!getUser.isSome()) {
      return Err({ UserDoesNotExist: "User must be registered" });
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

    // Update user by adding event to eventsCreated array
    const updateUserWithEvents: User = {
      ...getUser.unwrap(),
      eventsCreated: [...getUser.unwrap().eventsCreated, payload.nameOfEvent],
    };
    users.insert(payload.owner, updateUserWithEvents);

    return Ok(`${payload.nameOfEvent} event created successfully`);
  }),

  // Get all events
  getAllEvents: query([], Vec(Event), () => {
    return events.values();
  }),

  // Get event details
  getEventDetails: query([GetEventPayload], Result(Opt(Event), EventsError), (payload) => {
    if (!payload.nameOfEvent) {
      return Err({ InvalidDetails: "Event name is required" });
    }
    const event = events.get(payload.nameOfEvent);
    if (!event.isSome()) {
      return Err({ EventDoesNotExist: `Event ${payload.nameOfEvent} does not exist` });
    }
    return Ok(event);
  }),

  // Delete event
  deleteEvent: update([DeleteEventPayload], Result(text, EventsError), (payload) => {
    const getEvent = events.get(payload.nameOfEvent);
    if (!getEvent.isSome()) {
      return Err({ EventDoesNotExist: `No event with name ${payload.nameOfEvent}` });
    }

    const event = getEvent.unwrap();
    if (payload.ownerOfEvent.toText() !== event.owner) {
      return Err({ MustBeOwner: "Only the owner can delete this event" });
    }

    events.remove(payload.nameOfEvent);

    // Update user by removing the event from eventsCreated array
    const getUser = users.get(event.owner);
    if (getUser.isSome()) {
      const updatedUser: User = {
        ...getUser.unwrap(),
        eventsCreated: getUser.unwrap().eventsCreated.filter(e => e !== payload.nameOfEvent),
      };
      users.insert(event.owner, updatedUser);
    }

    return Ok(`Successfully deleted ${payload.nameOfEvent} event`);
  }),

  // Book event
  bookEvent: update([BookEventPayload], Result(text, EventsError), (payload) => {
    if (!payload.eventName || !payload.user) {
      return Err({ InvalidDetails: "Event name and username are both required to book" });
    }
    // Check if event exists
    const getEvent = events.get(payload.eventName);
    if (!getEvent.isSome()) {
      return Err({ EventDoesNotExist: `Event ${payload.eventName} is not available` });
    }
    const event = getEvent.unwrap();
    if (event.attendance.includes(payload.user)) {
      return Err({ InvalidDetails: `${payload.user} has already booked this event` });
    }
    const updatedEvent: Event = {
      ...event,
      attendance: [...event.attendance, payload.user],
    };
    events.insert(payload.eventName, updatedEvent);

    return Ok(`Successfully booked ${payload.eventName}`);
  }),

  // Check user registration status
  isUserRegistered: query([ProfilePayload], Result(bool, EventsError), (payload) => {
    const user = users.get(payload.user);
    return Ok(user.isSome());
  }),

  // List user events
  listUserEvents: query([ProfilePayload], Result(Vec(text), EventsError), (payload) => {
    const user = users.get(payload.user);
    if (!user.isSome()) {
      return Err({ UserDoesNotExist: `User ${payload.user} does not exist` });
    }
    return Ok(user.unwrap().eventsCreated);
  }),
});

// Function to generate Principal IDs
function generateId(): Principal {
  const randomBytes = new Array(29)
    .fill(0)
    .map((_) => Math.floor(Math.random() * 256));
  return Principal.fromUint8Array(Uint8Array.from(randomBytes));
}
