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
  role: text, // New field for RBAC
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
  capacity: nat64, // New field for capacity
  isPublic: boolean, // New field for visibility
  version: nat64, // New field for versioning
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
  capacity: nat64,
  isPublic: boolean,
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
const ModifyEventPayload = Record({
  nameOfEvent: text,
  newLocation: Opt(text),
  newDate: Opt(text),
  newCapacity: Opt(nat64),
});

// Event Errors
const EventsError = Variant({
  EventDoesNotExist: text,
  UserDoesNotExist: text,
  EnterCorrectDetails: text,
  EventNameIsRequired: text,
  MustBeOwner: text,
  EventFull: text,
});
type EventsError = typeof EventsError.tsType;

// Storages
let users = StableBTreeMap<text, User>(0);
let events = StableBTreeMap<text, Event>(1);

/**
 * Create an event canister
 */
export default Canister({
  // User registration
  registerUser: update([RegisterUserPayload], text, (payload) => {
    if (!payload.username) {
      return "Enter correct username";
    }
    const checkUserName = users.get(payload.username);
    if (checkUserName) {
      return `Username ${payload.username} is already taken. Try another one.`;
    }

    const user: User = {
      id: generateId(),
      createdAt: ic.time(),
      username: payload.username,
      eventsCreated: [],
      role: "user", // Default role
    };
    users.insert(payload.username, user);
    return `${payload.username} registered successfully`;
  }),

  // Get user profile
  getUserProfile: query([ProfilePayload], Result(Opt(User), EventsError), (payload) => {
    if (!payload.user) {
      return Err({
        EnterCorrectDetails: "User field is empty",
      });
    }
    const returnedUser = users.get(payload.user);
    if (!returnedUser) {
      return Err({
        UserDoesNotExist: "User not found",
      });
    }
    return Ok(returnedUser);
  }),

  // Update user profile
  updateUserProfile: update([UpdateUserProfilePayload], text, (payload) => {
    if (!payload.userName || !payload.newUserName) {
      return "Provide correct credentials";
    }
    const checkNewUserName = users.get(payload.newUserName);
    if (checkNewUserName) {
      return `Username ${payload.newUserName} is already taken. Try another one.`;
    }
    const getUser = users.get(payload.userName);
    if (!getUser) {
      return `Cannot update profile: ${payload.userName} not found`;
    }

    const updatedUser: User = {
      ...getUser,
      username: payload.newUserName,
    };
    users.insert(payload.newUserName, updatedUser);
    users.remove(payload.userName);
    return `Successfully updated profile from ${payload.userName} to ${payload.newUserName}`;
  }),

  // Delete user profile
  deleteProfile: update([DeleteProfilePayload], text, (payload) => {
    const checkUser = users.get(payload.owner);
    if (!checkUser) {
      return `User ${payload.owner} does not exist`;
    }
    users.remove(payload.owner);
    return `User ${payload.owner} has been deleted successfully`;
  }),

  // Create an event
  createEvent: update([EventsPayload], text, (payload) => {
    if (!payload.eventPoster || !payload.nameOfEvent || !payload.locationOfEvent || !payload.date || !payload.requirements) {
      return "Enter correct credentials";
    }

    const getUser = users.get(payload.owner);
    if (!getUser) {
      return "Must be registered to create an event";
    }

    const event: Event = {
      id: generateId(),
      eventPoster: payload.eventPoster,
      nameOfEvent: payload.nameOfEvent,
      locationOfEvent: payload.locationOfEvent,
      requirements: payload.requirements,
      date: payload.date,
      createdAt: ic.time(),
      owner: payload.owner,
      attendance: [],
      capacity: payload.capacity,
      isPublic: payload.isPublic,
      version: 1,
    };
    events.insert(payload.nameOfEvent, event);

    getUser.eventsCreated.push(event.nameOfEvent);
    users.insert(payload.owner, getUser);

    return `${payload.nameOfEvent} event created successfully`;
  }),

  // Get all events
  getAllEvents: query([], Vec(Event), () => {
    return events.values();
  }),

  // Get event details
  getAnEventDetail: query([GetEventPayload], Opt(Event), (payload) => {
    return events.get(payload.nameOfEvent);
  }),

  // Delete an event
  deleteEvent: update([DeleteEventPayload], text, (payload) => {
    const getEvent = events.get(payload.nameOfEvent);
    if (!getEvent) {
      return `No event named ${payload.nameOfEvent} available`;
    }

    if (payload.ownerOfEvent.toText() === getEvent.owner) {
      events.remove(payload.nameOfEvent);
      return `Successfully deleted ${payload.nameOfEvent} event`;
    }

    return `Unknown error occurred`;
  }),

  // Book an event
  bookEvent: update([BookEventPayload], text, (payload) => {
    if (!payload.eventName || !payload.user) {
      return "Event name and username are both required to book";
    }

    const getEvent = events.get(payload.eventName);
    if (!getEvent) {
      return `${payload.eventName} event is not available`;
    }

    if (getEvent.attendance.length >= getEvent.capacity) {
      return `Event ${payload.eventName} is fully booked`;
    }

    getEvent.attendance.push(payload.user);
    events.insert(payload.eventName, getEvent);

    return `Successfully booked ${payload.eventName}`;
  }),

  // Modify an event
  modifyEvent: update([ModifyEventPayload], text, (payload) => {
    const getEvent = events.get(payload.nameOfEvent);
    if (!getEvent) {
      return `Event ${payload.nameOfEvent} not found`;
    }

    if (payload.newLocation.isSome()) {
      getEvent.locationOfEvent = payload.newLocation.unwrap();
    }
    if (payload.newDate.isSome()) {
      getEvent.date = payload.newDate.unwrap();
    }
    if (payload.newCapacity.isSome()) {
      getEvent.capacity = payload.newCapacity.unwrap();
    }
    getEvent.version += 1;

    events.insert(payload.nameOfEvent, getEvent);
    return `Event ${payload.nameOfEvent} updated successfully`;
  }),
});

// Function to generate Principal IDs
function generateId(): Principal {
  const randomBytes = new Array(29).fill(0).map(() => Math.floor(Math.random() * 256));
  return Principal.fromUint8Array(Uint8Array.from(randomBytes));
}
