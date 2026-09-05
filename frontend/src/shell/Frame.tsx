import { Outlet } from 'react-router-dom'
import Nav from './Nav'

/* every page but home: the nav pill on the plain page, then the page */
export default function Frame() {
  return (
    <div className="frame">
      <div className="wrap">
        <Nav />
        <Outlet />
      </div>
    </div>
  )
}
