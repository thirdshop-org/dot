package entities

type User struct {
	Username string
}

func NewUser(username string) (error, *User) {
	return nil, &User{
		Username: username,
	}
}
